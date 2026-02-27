/*
 * Copyright (C) 2025 Qopy App
 * 
 * This file is part of Qopy.
 * 
 * Qopy is dual-licensed:
 * 
 * 1. GNU Affero General Public License v3.0 (AGPL-3.0)
 *    For open source use. See LICENSE-AGPL for details.
 * 
 * 2. Commercial License
 *    For proprietary/commercial use. Contact qopy.quiet156@passmail.net
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

const express = require('express');
const os = require('os');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const { body, param, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { Pool } = require('pg');
const fs = require('fs-extra');
const multer = require('multer');
const crypto = require('crypto');
const { createLimiter } = require('./services/utils/concurrencyLimiter');
const { safeDeleteFile } = require('./services/utils/fileOperations');
const mime = require('mime-types');
// Import services
const FileService = require('./services/FileService');
const CleanupService = require('./services/CleanupService');
const createAccessValidationMiddleware = require('./middleware/accessValidation');
const QuickShareProtection = require('./middleware/quickShareProtection');

// Note: File storage is handled directly in server.js using fs-extra
// The previous config/storage.js file has been removed as it was unused

// File storage configuration (define before multer config)
// STORAGE_PATH: Railway volumes persist across deploys; falls back to local ./uploads for dev
const STORAGE_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || './uploads';
// CHUNK_SIZE: 5MB balances upload throughput vs memory usage. Multer limit is CHUNK_SIZE + 1MB
// to accommodate encryption overhead (12-byte IV + 16-byte auth tag + padding).
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
// MAX_FILE_SIZE: Hard cap enforced both client-side and server-side during assembly
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// Configure multer for file uploads — use memory storage to avoid double disk writes
// Chunks are max 6MB which is safe for memory; eliminates temp file write/read/delete cycle
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: CHUNK_SIZE + (1024 * 1024) // 5MB chunk + 1MB buffer for encryption overhead
    }
});

// Use centralized Redis manager to prevent memory leaks
const redisManager = require('./config/redis');

// Initialize Redis connection
(async () => {
    try {
        await redisManager.connect();
    } catch (error) {
        console.warn('⚠️ Redis not available, using in-memory cache');
    }
})();

// Helper to get Redis client safely
const getRedis = () => {
    return redisManager.isConnected() ? redisManager.client : null;
};

const app = express();
const PORT = process.env.PORT || 8080;

console.log('🚀 Qopy Server starting...');

// Startup validation of required environment variables
const requiredEnvVars = ['DATABASE_URL', 'PBKDF2_SALT'];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`❌ FATAL: ${envVar} environment variable is required`);
        process.exit(1);
    }
}

// Warn for recommended optional variables
const optionalEnvVars = ['ADMIN_TOKEN', 'REDIS_URL'];
for (const envVar of optionalEnvVars) {
    if (!process.env[envVar]) {
        console.warn(`⚠️ Optional: ${envVar} not set`);
    }
}

// File storage configuration (already defined above)

// Ensure storage directories exist
async function initializeStorage() {
    try {
        // For Railway, use the volume mount path directly
        // Railway volumes are mounted at the specified path and are writable
        const chunksDir = path.join(STORAGE_PATH, 'chunks');
        const filesDir = path.join(STORAGE_PATH, 'files');
        const tempDir = path.join(STORAGE_PATH, 'temp');
        
        // Create directories with proper error handling
        await fs.ensureDir(chunksDir);
        await fs.ensureDir(filesDir);
        await fs.ensureDir(tempDir);
        
        // Fix permissions for upload directories using Node.js APIs (no shell commands)
        try {
            const { uid, gid } = os.userInfo();
            const dirs = [STORAGE_PATH, chunksDir, filesDir, tempDir];
            for (const dir of dirs) {
                fs.chownSync(dir, uid, gid);
                fs.chmodSync(dir, 0o775);
            }
        } catch (permError) {
            // Expected in most environments - permissions managed by platform
        }
        
        // Test write permissions
        const testFile = path.join(chunksDir, '.test');
        await fs.writeFile(testFile, 'test');
        await fs.remove(testFile);
        
        console.log(`✅ Storage initialized at: ${STORAGE_PATH}`);
    } catch (error) {
        console.error('❌ Failed to initialize storage:', error);
        
        // Provide helpful error message for Railway deployment
        if (error.code === 'EACCES') {
            console.error('💡 Railway Volume Setup Issue: Ensure RAILWAY_VOLUME_MOUNT_PATH is set and volume is attached');
        }
        
        // Don't exit in development, but warn
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        } else {
            console.warn('⚠️ Continuing without file upload support in development mode');
        }
    }
}

// Initialize storage on startup
initializeStorage();

// PostgreSQL Configuration
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
}

// Create PostgreSQL connection pool with optimized configuration
const pool = new Pool({
    connectionString: DATABASE_URL,
    // SSL: Railway and many managed Postgres providers use self-signed certs, so
    // rejectUnauthorized defaults to false. Set DATABASE_SSL_REJECT_UNAUTHORIZED=true
    // when using a provider with CA-signed certs for full MitM protection.
    ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true' }
        : false,
    
    // Connection pool sizing: Optimal formula = (average_concurrent_requests * 1.5)
    // For most web applications, 20 connections handle hundreds of concurrent users effectively
    // Previous value of 100 was excessive and caused unnecessary memory/connection overhead
    max: process.env.NODE_ENV === 'production' ? 20 : 10, // Optimized: 20 for production, 10 for development
    min: process.env.NODE_ENV === 'production' ? 5 : 2,   // Minimum connections: ~25% of max to handle baseline load
    
    // Connection lifecycle management
    idleTimeoutMillis: 30000,     // Close idle connections after 30 seconds
    connectionTimeoutMillis: 10000, // Wait 10 seconds for new connections
    retryDelay: 1000,
    maxRetries: 3,
    allowExitOnIdle: false,
    maxUses: 7500, // Recreate connection after 7500 queries (memory leak prevention)
});

/* 
 * Connection Pool Optimization Notes:
 * 
 * Current Configuration:
 * - Production: max 20, min 5 connections (reduced from 100 max)
 * - Development: max 10, min 2 connections
 * 
 * Performance Benefits:
 * - Reduced memory overhead (~80% less memory usage)
 * - Lower database server load
 * - Faster connection establishment
 * 
 * Dynamic Pool Sizing (Future Enhancement):
 * PostgreSQL's pg module supports dynamic adjustment through:
 * - pool.totalCount (current total connections)
 * - pool.idleCount (available connections)
 * - pool.waitingCount (queued requests)
 * 
 * To implement dynamic sizing, monitor these metrics and adjust
 * pool.options.max based on actual concurrent load patterns.
 */

// Initialize services
const fileService = new FileService();
const accessValidationMiddleware = createAccessValidationMiddleware(pool);

// Test database connection with retry
let connectionAttempts = 0;
const maxConnectionAttempts = 3;

let dbConnected = false;
pool.on('connect', () => {
    if (!dbConnected) {
        console.log('✅ Connected to PostgreSQL database');
        dbConnected = true;
    }
    connectionAttempts = 0; // Reset on successful connection
});

pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle client', err);
    connectionAttempts++;
    
    if (connectionAttempts >= maxConnectionAttempts) {
        console.error('❌ Max database connection attempts reached, shutting down...');
        process.exit(1);
    }
});

// Trust proxy for Railway deployment
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
  
} else {
  app.set('trust proxy', true);
  
}

// Health routes
const { registerHealthRoutes } = require('./routes/health');
registerHealthRoutes(app, { pool });

// CORS and security middleware — helmet enforces CSP, HSTS, and other HTTP security headers.
// Stripe domains are whitelisted for the payment integration (script-src, connect-src, frame-src).
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "https://js.stripe.com"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      frameSrc: ["https://js.stripe.com"],
      imgSrc: ["'self'", "data:", "https:"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
    },
  },
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  permissionsPolicy: {
    features: {
      camera: [],
      microphone: [],
      geolocation: [],
      payment: [],
    }
  },
}));

// Secure CORS Configuration
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        
        // Explicitly block Chrome Extensions and other potentially malicious origins (silently reject)
        if (origin.startsWith('chrome-extension://') ||
            origin.startsWith('moz-extension://') ||
            origin.startsWith('safari-extension://') ||
            origin.startsWith('ms-browser-extension://')) {
            return callback(null, false); // Reject but don't crash with error
        }
        
        const allowedOrigins = [];
        
        // Development origins
        if (process.env.NODE_ENV !== 'production') {
            allowedOrigins.push(
                'http://localhost:8080',
                'http://localhost:3000',
                'http://127.0.0.1:8080',
                'http://127.0.0.1:3000'
            );
        }
        
        // Production origins
        if (process.env.NODE_ENV === 'production') {
            allowedOrigins.push(
                'https://qopy.app',
                'https://qopy-production.up.railway.app',
                'https://qopy-staging.up.railway.app',
                'https://qopy-dev.up.railway.app'
            );
            
            // More secure Railway.app subdomain validation
            if (origin.endsWith('.railway.app')) {
                const railwayPattern = /^https:\/\/qopy-[a-zA-Z0-9\-]+(\.up)?\.railway\.app$/;
                if (railwayPattern.test(origin)) {
                    return callback(null, true);
                } else {
                    return callback(new Error('Invalid Railway domain pattern'));
                }
            }
        }
        
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// IP-based rate limiting functions
function getClientIP(req) {
  // Trust proxy for Railway deployment
  return req.ip || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket?.remoteAddress;
}

// Quick Share failed-lookup protection
const quickShareProtection = new QuickShareProtection();

// Rate limiting monitoring
function logRateLimitEvent(req, res, next) {
    const clientIP = getClientIP(req);
    const path = req.path;
    
    // Log rate limit hits
    res.on('finish', () => {
        if (res.statusCode === 429) {
            console.warn(`🚫 Rate limit hit by ${clientIP} on ${path}`);
        }
    });
    
    next();
}

// General API rate limiting (per IP)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per IP per 15 minutes
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIP,
  skip: (req) => {
    // Skip rate limiting for health checks (monitoring) and chunk upload paths.
    // Chunk uploads are already gated by the upload initiation limiter,
    // so applying the general limiter here would cause legitimate large-file uploads
    // to hit the 100-request cap mid-transfer.
    return req.path === '/health' || req.path === '/api/health' || req.path === '/ping' || req.path.match(/^\/api\/upload\/(chunk|complete)\//);
  }
});

// Clip retrieval rate limiting (more permissive for reading)
const retrieveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 retrieval requests per IP per 15 minutes
  message: {
    error: 'Too many retrieval requests',
    message: 'Retrieval rate limit exceeded. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIP
});

// Quick Share rate limiter (stricter for short clip IDs to prevent brute-force)
const quickShareLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 requests per IP per minute for short clip lookups
  message: {
    error: 'Too many requests',
    message: 'Quick Share rate limit exceeded. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIP,
  skip: (req) => {
    // Only apply to clip retrieval with short IDs (Quick Share length)
    const clipIdMatch = req.path.match(/^\/api\/clip\/([A-Za-z0-9]+)/);
    if (!clipIdMatch) return true;
    return clipIdMatch[1].length > 6;
  }
});

// Burst rate limiting (very short window for immediate protection)
const burstLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per IP per minute
  message: {
    error: 'Too many requests',
    message: 'Burst rate limit exceeded. Please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIP,
  skip: (req) => {
    // Skip burst limiting for health checks, admin routes, and chunk uploads/completion
    // Chunk uploads are already protected by the upload session initiation limiter
    return req.path === '/health' || req.path === '/api/health' || req.path === '/ping' || req.path.match(/^\/api\/upload\/(chunk|complete)\//);
  }
});

// Admin authentication rate limiting (strict)
const adminAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many authentication attempts', message: 'Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIP
});

app.use('/api/admin/auth', adminAuthLimiter);

// File download rate limiting (DoS protection for large file downloads)
const fileDownloadLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 50, // 50 downloads per IP per minute
    keyGenerator: (req) => getClientIP(req),
    message: { error: 'Too many download requests', message: 'Please try again in a minute' },
    standardHeaders: true,
    legacyHeaders: false
});

// Apply rate limiting (order matters - most specific first)
app.use('/api/', logRateLimitEvent); // Logging first
app.use('/api/', burstLimiter); // Burst protection
app.use('/api/', generalLimiter); // General protection
app.use('/api/clip/', quickShareLimiter); // Quick Share brute-force protection
app.use(quickShareProtection.middleware(getClientIP)); // Failed-lookup tracking for short IDs
app.use('/api/clip/', retrieveLimiter); // Retrieval-specific protection

// Public config endpoint (non-sensitive settings for client)
app.get('/api/config', (req, res) => {
    res.json({ pbkdf2Salt: process.env.PBKDF2_SALT });
});

// Serve minified assets first (if built), then fall back to source
if (fs.pathExistsSync(path.join(__dirname, 'public', 'dist'))) {
    app.use(express.static(path.join(__dirname, 'public', 'dist')));
}
app.use(express.static('public'));

// Explicit static file routes for /clip/ and root assets
const { registerStaticRoutes } = require('./routes/static');
registerStaticRoutes(app);

// Admin routes
const { registerAdminRoutes } = require('./routes/admin');
registerAdminRoutes(app, { pool });

// Clip retrieval routes
const { registerClipRoutes } = require('./routes/clips');
registerClipRoutes(app, { pool, updateStatistics, getRedis });

// Clip ID generation (cryptographically secure)
function generateClipId(quickShare = false) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const length = quickShare ? 6 : 10; // 6 for Quick Share (36^6 = 2.18B), 10 for normal shares
  const bytes = crypto.randomBytes(length);
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars.charAt(bytes[i] % chars.length);
  }
  return result;
}


// handleClipRetrieval has been moved to routes/clips.js

// safeDeleteFile imported from services/utils/fileOperations.js


// Upload session retrieval (used by upload routes and UploadCompletionService)
async function getUploadSession(uploadId) {
    try {
        const redis = getRedis();
        if (redis) {
            const cached = await redis.get(`upload:${uploadId}`);
            if (cached) {
                try {
                    return JSON.parse(cached);
                } catch (error) {
                    // Fall through to database lookup
                }
            }
        }
    } catch (redisError) {
        // Redis unavailable, fall through to database
    }

    // Fallback to database
    try {
        const result = await pool.query(
            'SELECT * FROM upload_sessions WHERE upload_id = $1',
            [uploadId]
        );

        if (result.rows[0]) {
            const session = result.rows[0];

            // Cache it for next time
            const redis = getRedis();
            if (redis) {
                try {
                    await redis.setEx(`upload:${uploadId}`, 3600, JSON.stringify(session));
                } catch (cacheError) {
                    // Non-critical: database is primary source of truth
                }
            }

            return session;
        } else {
            return null;
        }
    } catch (dbError) {
        // Database error getting upload session
        return null;
    }
}

// Sanitize filename for path safety: no path separators or traversal (prevents path traversal when building finalPath)
function sanitizeFilenameForPath(name) {
    if (typeof name !== 'string' || !name.length) return 'file';
    return name
        .replace(/[/\\]/g, '_')
        .replace(/\0/g, '')
        .replace(/\.\./g, '')
        .replace(/[\x00-\x1f\x7f]/g, '')
        .substring(0, 255) || 'file';
}

// File assembly (used by upload routes via UploadCompletionService)
async function assembleFile(uploadId, session) {
    try {
        const safeFilename = sanitizeFilenameForPath(session.filename || 'file');
        const finalPath = path.join(STORAGE_PATH, 'files', `${uploadId}_${safeFilename}`);
        await fs.mkdir(path.dirname(finalPath), { recursive: true });
        
        const writeStream = require('fs').createWriteStream(finalPath);
        
        // 🚀 PARALLEL OPTIMIZATION: Read all chunks concurrently with controlled concurrency
        const limit = createLimiter(5); // Limit to 5 concurrent operations to avoid overwhelming system
        
        // Create chunk reading tasks
        const chunkTasks = [];
        for (let i = 0; i < session.total_chunks; i++) {
            chunkTasks.push(limit(async () => {
                const chunkPath = path.join(STORAGE_PATH, 'chunks', uploadId, `chunk_${i}`);
                
                // Check if chunk file exists
                const chunkExists = await fs.pathExists(chunkPath);
                if (!chunkExists) {
                    throw new Error(`Chunk file not found: ${chunkPath}`);
                }
                
                const chunkData = await fs.readFile(chunkPath);
                return { index: i, data: chunkData };
            }));
        }
        
        // Execute all chunk reads in parallel
        const chunks = await Promise.all(chunkTasks);
        
        // Sort chunks by index to ensure correct order
        chunks.sort((a, b) => a.index - b.index);
        
        // Write chunks to stream in correct order using efficient Buffer operations
        for (const chunk of chunks) {
            writeStream.write(chunk.data);
        }
        
        writeStream.end();
        
        // 🚀 PARALLEL OPTIMIZATION: Clean up chunks concurrently
        const cleanupTasks = [];
        for (let i = 0; i < session.total_chunks; i++) {
            cleanupTasks.push(limit(async () => {
                const chunkPath = path.join(STORAGE_PATH, 'chunks', uploadId, `chunk_${i}`);
                try {
                    await fs.unlink(chunkPath);
                    return { success: true, path: chunkPath };
                } catch (error) {
                    // Non-critical: chunk cleanup failed
                    return { success: false, path: chunkPath, error: error.message };
                }
            }));
        }
        
        // Execute all cleanup operations in parallel
        const cleanupResults = await Promise.all(cleanupTasks);
        return finalPath;
    } catch (error) {
        console.error(`❌ Error in assembleFile for uploadId ${uploadId}:`, error);
        throw error;
    }
}

// Upload routes (initiate, chunk, complete, status, cancel)
const { registerUploadRoutes } = require('./routes/uploads');
registerUploadRoutes(app, {
    pool,
    upload,
    redisManager,
    getRedis,
    STORAGE_PATH,
    CHUNK_SIZE,
    MAX_FILE_SIZE,
    generateClipId,
    updateStatistics,
    safeDeleteFile,
    assembleFile,
    getUploadSession,
    getClientIP
});


// File routes (info, download, legacy)
const { registerFileRoutes } = require('./routes/files');
registerFileRoutes(app, { pool, fileService, fileDownloadLimiter, accessValidationMiddleware, updateStatistics, storagePath: STORAGE_PATH });

// Upload system routes are in routes/uploads.js
// Clip retrieval routes are in routes/clips.js

// Route for direct clip access (must come after static files)
app.get('/clip/:clipId([A-Z0-9]{6}|[A-Z0-9]{10})$', (req, res) => {
  // This route matches exact 6-character (Quick Share) or 10-character (normal) alphanumeric clip IDs
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Multer error handling middleware (must be before global error handler)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('❌ Multer error:', err.code, err.message);
    
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(413).json({
          error: 'File too large',
          message: `Chunk size exceeds limit of ${Math.floor((CHUNK_SIZE + (1024 * 1024)) / (1024 * 1024))}MB`
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(413).json({
          error: 'Too many files',
          message: 'Only one file per chunk allowed'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          error: 'Unexpected file',
          message: 'File field not expected'
        });
      default:
        return res.status(400).json({
          error: 'Upload error',
          message: err.message || 'File upload failed'
        });
    }
  }
  
  // Pass non-multer errors to the global error handler
  next(err);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', { message: err.message, code: err.code });
  res.status(500).json({
    error: 'Internal server error',
    message: 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested resource was not found'
  });
});

// Set up periodic cleanup using CleanupService
const cleanupService = new CleanupService(pool, STORAGE_PATH, getRedis);
cleanupService.start(60 * 1000); // Every minute

// Graceful shutdown handlers
process.on('SIGTERM', () => {
    gracefulShutdown('SIGTERM');
});

process.on('SIGINT', () => {
    gracefulShutdown('SIGINT');
});

// Statistics update functions
async function updateStatistics(type, increment = 1) {
    try {
        let updateQuery;
        switch (type) {
            case 'clip_created':
                updateQuery = `
                    UPDATE statistics 
                    SET total_clips = total_clips + $1, last_updated = $2
                `;
                break;
            case 'clip_accessed':
                updateQuery = `
                    UPDATE statistics 
                    SET total_accesses = total_accesses + $1, last_updated = $2
                `;
                break;
            case 'quick_share_created':
                updateQuery = `
                    UPDATE statistics 
                    SET quick_share_clips = quick_share_clips + $1, last_updated = $2
                `;
                break;
            case 'password_protected_created':
                updateQuery = `
                    UPDATE statistics 
                    SET password_protected_clips = password_protected_clips + $1, last_updated = $2
                `;
                break;
            case 'one_time_created':
                updateQuery = `
                    UPDATE statistics 
                    SET one_time_clips = one_time_clips + $1, last_updated = $2
                `;
                break;
            case 'normal_created':
                updateQuery = `
                    UPDATE statistics 
                    SET normal_clips = normal_clips + $1, last_updated = $2
                `;
                break;
            default:
                return;
        }
        
        await pool.query(updateQuery, [increment, Date.now()]);
    } catch (error) {
        // Non-critical: statistics update failed
    }
}

// Graceful shutdown
async function gracefulShutdown(signal = 'SIGTERM') {
    console.log(`🛑 Graceful shutdown initiated [${signal}]`);
    
    // Stop cleanup service
    cleanupService.stop();

    // Shutdown Quick Share protection tracker
    quickShareProtection.shutdown();
    
    // Set a more generous timeout for Railway platform (30 seconds)
    const shutdownTimeout = setTimeout(() => {
        console.log('⚠️ Graceful shutdown timeout exceeded, forcing exit...');
        process.exit(1);
    }, 30000); // Increased from 10s to 30s for Railway
    
    try {
        // Close Redis connection first
        if (redisManager) {
            await redisManager.disconnect();
        }

        // Close database connection pool
        await pool.end();

        // Clear the timeout
        clearTimeout(shutdownTimeout);

        console.log('✅ Server shutdown complete');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during graceful shutdown:', error.message);
        clearTimeout(shutdownTimeout);
        process.exit(1);
    }
}

// Initialize and start server
const { runMigrations } = require('./migrations/run');

async function startServer() {
    try {
        // Test database connection
        const client = await pool.connect();
        await client.query('SELECT NOW() as current_time');
        client.release();

        // Ensure storage directory exists
        await initializeStorage();

        // Run database migrations
        await runMigrations(pool);

        app.listen(PORT, () => {
            console.log(`🚀 Qopy server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}

// Migrations moved to migrations/run.js

startServer();
