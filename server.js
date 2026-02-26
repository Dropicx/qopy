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
const mime = require('mime-types');
const sharp = require('sharp');

// Import services
const FileService = require('./services/FileService');
const createAccessValidationMiddleware = require('./middleware/accessValidation');
const QuickShareProtection = require('./middleware/quickShareProtection');

// Note: File storage is handled directly in server.js using fs-extra
// The previous config/storage.js file has been removed as it was unused

// File storage configuration (define before multer config)
const STORAGE_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || './uploads';
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// Configure multer for file uploads
const upload = multer({
    storage: multer.diskStorage({
        destination: async function (req, file, cb) {
            // Use a temporary directory for chunk uploads
            const tempDir = path.join(STORAGE_PATH, 'temp');
            try {
                await fs.ensureDir(tempDir);
                cb(null, tempDir);
            } catch (error) {
                console.error('❌ Error creating temp directory:', error);
                cb(error);
            }
        },
        filename: function (req, file, cb) {
            // Generate unique filename for temporary storage
            const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
            cb(null, uniqueName);
        }
    }),
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
        if (redisManager.isConnected()) {
            console.log('🔗 Using centralized Redis manager');
        } else {
            console.warn('⚠️ Redis not available, using in-memory cache');
        }
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
        
        // Fix permissions for upload directories
        try {
            // Get current user info
            const { execSync } = require('child_process');
            const uid = execSync('id -u', { encoding: 'utf8' }).trim();
            const gid = execSync('id -g', { encoding: 'utf8' }).trim();
            
            console.log(`🔧 Current user: ${uid}:${gid}`);
            
            // Set proper ownership and permissions
            execSync(`chown -R ${uid}:${gid} ${STORAGE_PATH}`);
            execSync(`chmod -R 775 ${STORAGE_PATH}`);
            
            console.log(`✅ Fixed permissions for storage directories`);
        } catch (permError) {
            console.warn(`⚠️ Could not fix permissions (this is normal in some environments): ${permError.message}`);
        }
        
        // Test write permissions
        const testFile = path.join(chunksDir, '.test');
        await fs.writeFile(testFile, 'test');
        await fs.remove(testFile);
        
        console.log(`✅ Storage directories initialized at: ${STORAGE_PATH}`);
        console.log(`   - Chunks: ${chunksDir}`);
        console.log(`   - Files: ${filesDir}`);
        console.log(`   - Temp: ${tempDir}`);
    } catch (error) {
        console.error('❌ Failed to initialize storage:', error);
        
        // Provide helpful error message for Railway deployment
        if (error.code === 'EACCES') {
            console.error('💡 Railway Volume Setup Issue:');
            console.error('   1. Make sure you have added a Volume plugin in Railway dashboard');
            console.error('   2. Set RAILWAY_VOLUME_MOUNT_PATH environment variable to the volume path');
            console.error('   3. The volume path should be something like: /var/lib/containers/railwayapp/bind-mounts/...');
            console.error('   4. Restart the deployment after adding the volume');
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
    console.error('❌ DATABASE_URL environment variable is required for PostgreSQL');
    console.error('   Please add PostgreSQL plugin in Railway dashboard');
    process.exit(1);
}

// Create PostgreSQL connection pool with optimized configuration
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    
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

pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
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

// Debug endpoint - only enabled when DEBUG=true (disabled in production)
if (process.env.DEBUG === 'true') {
  app.get('/api/debug/files/:clipId', async (req, res) => {
  try {
    const { clipId } = req.params;
    
    // Get clip information from database
    const clipResult = await pool.query(
      'SELECT * FROM clips WHERE clip_id = $1',
      [clipId]
    );
    
    if (clipResult.rows.length === 0) {
      return res.status(404).json({ error: 'Clip not found' });
    }
    
    const clip = clipResult.rows[0];
    
    // Check if it's a file
    if (clip.content_type !== 'file' || !clip.file_path) {
      return res.status(400).json({ error: 'Not a file clip' });
    }
    
    // Get file path
    const filePath = path.join(STORAGE_PATH, 'files', clip.file_path);
    
    // Check if file exists
    const fileExists = await fs.pathExists(filePath);
    if (!fileExists) {
      return res.status(404).json({ error: 'File not found on disk' });
    }
    
    // Get file stats
    const stats = await fs.stat(filePath);
    
    // Read first 32 bytes to check encryption
    const fileBuffer = await fs.readFile(filePath);
    const firstBytes = fileBuffer.slice(0, 32);
    const firstBytesHex = firstBytes.toString('hex');
    
    // Check if file looks encrypted (should start with IV for AES-GCM)
    const isLikelyEncrypted = fileBuffer.length >= 12 && 
      // AES-GCM uses 12-byte IV, so first 12 bytes should be random
      // We can't definitively say it's encrypted, but we can check patterns
      fileBuffer.length > 100; // Encrypted files are usually larger than original
    
    // Get chunk information
    const chunksResult = await pool.query(
      'SELECT chunk_number, storage_path, chunk_size FROM file_chunks WHERE upload_id = $1 ORDER BY chunk_number',
      [clip.upload_id]
    );
    
    const chunks = await Promise.all(chunksResult.rows.map(async chunk => {
      const chunkPath = path.join(STORAGE_PATH, 'chunks', chunk.storage_path);
      const exists = await fs.pathExists(chunkPath);
      let actualSize = 0;
      if (exists) {
        try {
          const stats = await fs.stat(chunkPath);
          actualSize = stats.size;
        } catch (error) {
          console.warn(`⚠️ Could not get stats for chunk ${chunkPath}:`, error);
        }
      }
      return {
        chunkNumber: chunk.chunk_number,
        storagePath: chunk.storage_path,
        chunkSize: chunk.chunk_size,
        exists,
        actualSize
      };
    }));
    
    res.json({
      clipId,
      fileInfo: {
        filename: clip.filename,
        originalSize: clip.filesize,
        contentType: clip.content_type,
        filePath: clip.file_path,
        uploadId: clip.upload_id
      },
      diskInfo: {
        fileExists,
        fileSize: stats.size,
        fileSizeFormatted: formatBytes(stats.size),
        lastModified: stats.mtime,
        isLikelyEncrypted,
        first32BytesHex: firstBytesHex,
        first32BytesAscii: firstBytes.toString('ascii').replace(/[^\x20-\x7E]/g, '.')
      },
      chunks: {
        totalChunks: chunks.length,
        chunks: chunks
      },
      analysis: {
        isEncrypted: isLikelyEncrypted,
        encryptionIndicators: {
          hasIV: fileBuffer.length >= 12,
          sizeIncreased: stats.size > clip.filesize,
          randomFirstBytes: !isTextContent(firstBytes),
          chunked: chunks.length > 1
        }
      }
    });
    
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
  });
}

// Helper function to format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to check if content looks like text
function isTextContent(buffer) {
  const text = buffer.toString('utf8');
  // Check if it contains mostly printable ASCII characters
  const printableChars = text.replace(/[^\x20-\x7E]/g, '').length;
  const totalChars = text.length;
  return totalChars > 0 && (printableChars / totalChars) > 0.8;
}

// Enhanced middleware configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
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
            console.warn(`🚫 BLOCKED: Browser extension origin: ${origin}`);
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
                    console.log(`✅ Allowed Railway origin: ${origin}`);
                    return callback(null, true);
                } else {
                    console.warn(`🚫 Rejected Railway origin (invalid pattern): ${origin}`);
                    return callback(new Error('Invalid Railway domain pattern'));
                }
            }
        }
        
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`🚫 CORS blocked origin: ${origin}`);
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
    // Skip rate limiting for health checks, admin routes, and chunk uploads
    // Chunk uploads are already protected by the upload session initiation limiter
    return req.path === '/health' || req.path === '/api/health' || req.path === '/ping' || req.path.match(/^\/api\/upload\/chunk\//);
  }
});

// Share API rate limiting (stricter for content creation)
const shareLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 share requests per IP per 15 minutes
  message: {
    error: 'Too many share requests',
    message: 'Share rate limit exceeded. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIP
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
  max: 30, // 30 requests per IP per minute
  message: {
    error: 'Too many requests',
    message: 'Burst rate limit exceeded. Please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIP,
  skip: (req) => {
    // Skip burst limiting for health checks, admin routes, and chunk uploads
    // Chunk uploads are already protected by the upload session initiation limiter
    return req.path === '/health' || req.path === '/api/health' || req.path === '/ping' || req.path.match(/^\/api\/upload\/chunk\//);
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

// Apply rate limiting (order matters - most specific first)
app.use('/api/', logRateLimitEvent); // Logging first
app.use('/api/', burstLimiter); // Burst protection
app.use('/api/', generalLimiter); // General protection
app.use('/api/share', shareLimiter); // Share-specific protection
app.use('/api/clip/', quickShareLimiter); // Quick Share brute-force protection
app.use(quickShareProtection.middleware(getClientIP)); // Failed-lookup tracking for short IDs
app.use('/api/clip/', retrieveLimiter); // Retrieval-specific protection

// Public config endpoint (non-sensitive settings for client)
app.get('/api/config', (req, res) => {
    res.json({ pbkdf2Salt: process.env.PBKDF2_SALT || 'qopy-access-salt-v1' });
});

// Serve static files (before API routes)
app.use(express.static('public'));

// Explicit static file routes for /clip/ and root assets
const { registerStaticRoutes } = require('./routes/static');
registerStaticRoutes(app);

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

// Password hashing functions


// Enhanced cleanup for expired clips and uploads
async function cleanupExpiredClips() {
  try {
    const now = Date.now();
    
    // Get clips that are about to be marked as expired to delete their files
    const expiredClipsWithFiles = await pool.query(
      'SELECT clip_id, file_path FROM clips WHERE expiration_time < $1 AND is_expired = false AND file_path IS NOT NULL',
      [now]
    );
    
    // Delete files for expired clips
    let deletedFilesCount = 0;
    for (const clip of expiredClipsWithFiles.rows) {
      if (clip.file_path) {
        const result = await safeDeleteFile(clip.file_path);
        if (result.success) {
          deletedFilesCount++;
          console.log(`🧹 Deleted expired file: ${clip.file_path} (clip: ${clip.clip_id})`);
        } else {
          console.warn(`⚠️ Failed to delete expired file: ${clip.file_path} - ${result.reason}: ${result.error}`);
        }
      }
    }
    
    // Mark expired clips as expired instead of deleting them
    const markResult = await pool.query(
      'UPDATE clips SET is_expired = true WHERE expiration_time < $1 AND is_expired = false',
      [now]
    );
    
    // Delete clips that have been expired for more than 5 minutes
    const deleteResult = await pool.query(
      'DELETE FROM clips WHERE is_expired = true AND expiration_time < $1',
      [now - (5 * 60 * 1000)] // 5 minutes ago
    );
    
    // Check if we need to reset the sequence (if we're approaching the limit)
    const sequenceCheck = await pool.query(
      'SELECT last_value FROM clips_id_seq'
    );
    const currentSequence = parseInt(sequenceCheck.rows[0].last_value);
    
    // If we're above 2 billion (approaching SERIAL limit), reset to safe value
    if (currentSequence > 2000000000) {
      const maxIdResult = await pool.query('SELECT COALESCE(MAX(id), 0) as max_id FROM clips');
      const maxId = parseInt(maxIdResult.rows[0].max_id);
      const newStartValue = Math.max(1, maxId + 1000); // Start 1000 above current max
      
      await pool.query(
        'ALTER SEQUENCE clips_id_seq RESTART WITH $1',
        [newStartValue]
      );
      
      console.log(`🔄 Reset SERIAL sequence to ${newStartValue} (was ${currentSequence})`);
    }
    
    if (deletedFilesCount > 0) {
      console.log(`🧹 Deleted ${deletedFilesCount} expired files`);
    }
    
    if (markResult.rowCount > 0) {
      console.log(`🏷️ Marked ${markResult.rowCount} clips as expired`);
    }
    
    if (deleteResult.rowCount > 0) {
      console.log(`🧹 Permanently deleted ${deleteResult.rowCount} old expired clips`);
    }
  } catch (error) {
    console.error('❌ Error cleaning up expired clips:', error.message);
  }
}

// Helper function for clip retrieval (shared between GET and POST endpoints)
async function handleClipRetrieval(req, res, clip, clipId) {
  try {
    // Update access count and timestamp
    await pool.query(`
      UPDATE clips 
      SET access_count = access_count + 1, accessed_at = $1 
      WHERE clip_id = $2
    `, [Date.now(), clipId]);
    
    // Update statistics
    await updateStatistics('clip_accessed');

    // Handle content based on storage type
    let responseContent;
    let contentMetadata = {};
    
    if (clip.content_type === 'file') {
      // File stored on disk - redirect to file endpoint
      return res.json({
        success: true,
        contentType: 'file',
        redirectTo: `/api/file/${clipId}`,
        filename: clip.original_filename,
        filesize: clip.filesize,
        mimeType: clip.mime_type,
        expiresAt: clip.expiration_time,
        oneTime: clip.one_time
      });
    } else if (clip.file_path) {
      // Content stored as file - redirect to file endpoint for unified handling
      if (clip.content_type === 'text') {
        // Text content stored as file - redirect to file endpoint but mark as text
        const response = {
          success: true,
          contentType: 'text',
          redirectTo: `/api/file/${clipId}`,
          filename: clip.original_filename,
          filesize: clip.filesize,
          mimeType: clip.mime_type || 'text/plain',
          expiresAt: clip.expiration_time,
          oneTime: clip.one_time,
          isTextFile: true // Special flag to indicate this should be decrypted and shown as text
        };
        
        // For Quick Share clips (short ID), include the secret for decryption
        if (clipId.length <= 6 && clip.password_hash) {
          console.log('🔑 Adding quickShareSecret for short clip:', clipId);
          response.quickShareSecret = clip.password_hash;
        }
        
        return res.json(response);
      } else {
        // Regular file - redirect to file endpoint
        return res.json({
          success: true,
          contentType: 'file',
          redirectTo: `/api/file/${clipId}`,
          filename: clip.original_filename,
          filesize: clip.filesize,
          mimeType: clip.mime_type,
          expiresAt: clip.expiration_time,
          oneTime: clip.one_time
        });
      }
    } else if (clip.content) {
      // Content stored inline in database
      if (clip.content_type === 'text') {
        responseContent = clip.content; // Already a string
        contentMetadata.contentType = 'text';
      } else {
        // Binary content
        if (Buffer.isBuffer(clip.content)) {
          responseContent = Array.from(clip.content);
          contentMetadata.contentType = 'binary';
        } else if (typeof clip.content === 'string') {
          responseContent = clip.content;
          contentMetadata.contentType = 'text';
        } else {
          responseContent = clip.content.toString();
          contentMetadata.contentType = 'text';
        }
      }
      
      // Handle one-time access for inline content
      if (clip.one_time) {
        console.log('🔥 One-time access for inline content, deleting clip:', clipId);
        await pool.query('DELETE FROM clips WHERE clip_id = $1', [clipId]);
      }
    } else {
      return res.status(404).json({
        error: 'No content found',
        message: 'The clip contains no content'
      });
    }

    // Prepare response for inline content
    const response = {
      success: true,
      content: responseContent,
      contentType: contentMetadata.contentType || 'binary',
      expiresAt: clip.expiration_time,
      oneTime: clip.one_time,
      hasPassword: false
    };

    // Add file metadata if available
    if (clip.filesize) response.filesize = clip.filesize;
    if (clip.mime_type) response.mimeType = clip.mime_type;

    // For Quick Share clips, include the secret for decryption
    if (clipId.length <= 6 && clip.password_hash) {
      console.log('🔑 Adding quickShareSecret for short clip (inline):', clipId);
      response.quickShareSecret = clip.password_hash;
    } else if (clipId.length > 6) {
      response.hasPassword = clip.requires_access_code || false;
    }
    
    return res.json(response);

  } catch (error) {
    console.error('❌ Error in handleClipRetrieval:', error.message);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve clip'
    });
  }
}

// Helper function to safely delete files with permission handling
async function safeDeleteFile(filePath) {
    try {
        // Check if file exists
        const fileExists = await fs.pathExists(filePath);
        if (!fileExists) {
            return { success: true, reason: 'file_not_exists' };
        }
        
        // Get file stats
        const stats = await fs.stat(filePath);
        
        // Try to delete
        await fs.unlink(filePath);
        return { success: true, reason: 'deleted' };
    } catch (error) {
        // Handle specific error cases
        if (error.code === 'ENOENT') {
            return { success: true, reason: 'file_not_exists' };
        } else if (error.code === 'EACCES' || error.code === 'EPERM') {
            return { success: false, reason: 'permission_denied', error: error.message };
        } else if (error.code === 'EBUSY' || error.code === 'ENOTEMPTY') {
            return { success: false, reason: 'file_in_use', error: error.message };
        } else {
            return { success: false, reason: 'unknown_error', error: error.message };
        }
    }
}

// Cleanup expired uploads and orphaned files
async function cleanupExpiredUploads() {
  try {
    const now = Date.now();
    
    // Get expired upload sessions
    const expiredSessions = await pool.query(
      'SELECT upload_id FROM upload_sessions WHERE expiration_time < $1 OR (status = $2 AND last_activity < $3)',
      [now, 'uploading', now - (24 * 60 * 60 * 1000)] // 24 hours old
    );
    
    for (const session of expiredSessions.rows) {
      const uploadId = session.upload_id;
      
      try {
        // Get and delete chunks
        const chunks = await pool.query(
          'SELECT storage_path FROM file_chunks WHERE upload_id = $1',
          [uploadId]
        );
        
        // 🚀 PARALLEL OPTIMIZATION: Delete chunks concurrently
        // Native concurrency limiter to avoid p-limit ES6 import issues
        function createLimiter(limit) {
            let running = 0;
            const queue = [];
            
            const run = async (fn) => {
                return new Promise((resolve, reject) => {
                    queue.push({ fn, resolve, reject });
                    process();
                });
            };
            
            const process = async () => {
                if (running >= limit || queue.length === 0) return;
                
                running++;
                const { fn, resolve, reject } = queue.shift();
                
                try {
                    const result = await fn();
                    resolve(result);
                } catch (error) {
                    reject(error);
                } finally {
                    running--;
                    process();
                }
            };
            
            return run;
        }
        
        const limit = createLimiter(10); // Allow more concurrency for file deletion
        
        const deleteTasks = chunks.rows.map(chunk => 
          limit(async () => {
            const result = await safeDeleteFile(chunk.storage_path);
            if (!result.success) {
              console.warn(`⚠️ Failed to delete chunk file: ${chunk.storage_path} - ${result.reason}: ${result.error}`);
            }
            return result;
          })
        );
        
        await Promise.all(deleteTasks);
        
        // Delete database records
        await pool.query('DELETE FROM file_chunks WHERE upload_id = $1', [uploadId]);
        await pool.query('DELETE FROM upload_sessions WHERE upload_id = $1', [uploadId]);
        
        // Clear cache
        const redis = getRedis();
        if (redis) {
          await redis.del(`upload:${uploadId}`);
        }
        
      } catch (error) {
        console.error(`❌ Error cleaning up upload ${uploadId}:`, error.message);
      }
    }
    
    if (expiredSessions.rows.length > 0) {
      console.log(`🧹 Cleaned up ${expiredSessions.rows.length} expired upload sessions`);
    }
    
    // Clean up orphaned files (files without corresponding clips)
    const orphanedFiles = await pool.query(`
      SELECT file_path FROM clips 
      WHERE content_type = 'file' AND file_path IS NOT NULL 
      AND NOT EXISTS (
        SELECT 1 FROM clips c2 WHERE c2.file_path = clips.file_path AND c2.expiration_time >= $1
      )
    `, [now]);
    
    let deletedCount = 0;
    let failedCount = 0;
    
    for (const file of orphanedFiles.rows) {
      const result = await safeDeleteFile(file.file_path);
      
      if (result.success) {
        if (result.reason === 'deleted') {
          deletedCount++;
          console.log(`✅ Successfully deleted orphaned file: ${file.file_path}`);
        } else {
          console.log(`ℹ️ Orphaned file already deleted: ${file.file_path}`);
        }
      } else {
        failedCount++;
        console.warn(`⚠️ Failed to delete orphaned file: ${file.file_path}`, {
          reason: result.reason,
          error: result.error
        });
        
        // Log specific error types
        if (result.reason === 'permission_denied') {
          console.error(`🔒 Permission denied deleting file: ${file.file_path}`);
        } else if (result.reason === 'file_in_use') {
          console.error(`🔒 File in use or directory not empty: ${file.file_path}`);
        }
      }
    }
    
    if (orphanedFiles.rows.length > 0) {
      console.log(`🧹 Orphaned file cleanup: ${deletedCount} deleted, ${failedCount} failed, ${orphanedFiles.rows.length} total`);
    }
    
  } catch (error) {
    console.error('❌ Error cleaning up expired uploads:', error.message);
  }
}

// Upload session management functions
async function createUploadSession(sessionData) {
    console.log(`📝 Creating upload session: ${sessionData.uploadId}, total_chunks: ${sessionData.total_chunks}`);
    
    const redis = getRedis();
    if (redis) {
        await redis.setEx(`upload:${sessionData.uploadId}`, 3600, JSON.stringify(sessionData));
        console.log(`✅ Cached session in Redis: ${sessionData.uploadId}`);
    }
    
    return sessionData;
}

async function getUploadSession(uploadId) {
    console.log(`🔍 Getting upload session: ${uploadId}`);
    
    try {
        const redis = getRedis();
        if (redis) {
            console.log(`🔍 Checking Redis for session: ${uploadId}`);
            const cached = await redis.get(`upload:${uploadId}`);
            if (cached) {
                console.log(`✅ Found session in Redis: ${uploadId}`);
                try {
                    const parsed = JSON.parse(cached);
                    console.log('✅ Parsed session from Redis:', uploadId);
                    return parsed;
                } catch (error) {
                    console.error(`❌ Error parsing Redis session:`, error);
                    // Fall through to database lookup
                }
            } else {
                console.log(`❌ No session found in Redis: ${uploadId}`);
            }
        }
    } catch (redisError) {
        console.error(`❌ Redis error:`, redisError);
    }
    
    // Fallback to database
    console.log(`🔍 Falling back to database for session: ${uploadId}`);
    try {
        const result = await pool.query(
            'SELECT * FROM upload_sessions WHERE upload_id = $1',
            [uploadId]
        );
        
        if (result.rows[0]) {
            const session = result.rows[0];
            console.log(`✅ Found session in database: ${uploadId}`, {
                uploaded_chunks: `${session.uploaded_chunks}/${session.total_chunks}`,
                has_password: session.has_password,
                one_time: session.one_time,
                quick_share: session.quick_share,
                is_text_content: session.is_text_content
            });
            
            // Cache it for next time
            const redis = getRedis();
            if (redis) {
                try {
                    await redis.setEx(`upload:${uploadId}`, 3600, JSON.stringify(session));
                    console.log(`✅ Cached database session in Redis: ${uploadId}`);
                } catch (cacheError) {
                    console.error(`❌ Error caching session:`, cacheError);
                }
            }
            
            return session;
        } else {
            console.log(`❌ Session not found in database: ${uploadId}`);
            return null;
        }
    } catch (dbError) {
        console.error(`❌ Database error:`, dbError);
        return null;
    }
}

async function updateUploadSession(uploadId, updates) {
    console.log(`🔄 Updating upload session: ${uploadId}, uploaded_chunks: ${updates.uploaded_chunks}, status: ${updates.status}`);
    await pool.query(
        'UPDATE upload_sessions SET uploaded_chunks = $1, last_activity = $2, status = $3 WHERE upload_id = $4',
        [updates.uploaded_chunks, Date.now(), updates.status || 'uploading', uploadId]
    );
    const redis = getRedis();
    if (redis) {
        // Hole Session direkt aus der Datenbank, nicht aus Redis!
        const result = await pool.query('SELECT * FROM upload_sessions WHERE upload_id = $1', [uploadId]);
        const session = result.rows[0];
        if (session) {
            await redis.setEx(`upload:${uploadId}`, 3600, JSON.stringify(session));
        }
    }
    console.log(`✅ Upload session updated: ${uploadId}`);
}

// File utility functions
function generateUploadId() {
    return crypto.randomBytes(16).toString('hex');
}

function calculateChunks(filesize) {
    return Math.ceil(filesize / CHUNK_SIZE);
}

async function saveChunkToFile(uploadId, chunkNumber, chunkData) {
    const chunkDir = path.join(STORAGE_PATH, 'chunks', uploadId);
    await fs.mkdir(chunkDir, { recursive: true });
    
    const chunkPath = path.join(chunkDir, `chunk_${chunkNumber}`);
    await fs.writeFile(chunkPath, chunkData);
    
    return chunkPath;
}

async function assembleFile(uploadId, session) {
    try {
        console.log(`🔍 assembleFile started for uploadId: ${uploadId}, filename: ${session.filename}`);
        const finalPath = path.join(STORAGE_PATH, 'files', `${uploadId}_${session.filename}`);
        console.log(`🔍 Final path: ${finalPath}`);
        
        await fs.mkdir(path.dirname(finalPath), { recursive: true });
        console.log(`🔍 Directory created/verified: ${path.dirname(finalPath)}`);
        
        const writeStream = require('fs').createWriteStream(finalPath);
        
        // 🚀 PARALLEL OPTIMIZATION: Read all chunks concurrently with controlled concurrency
        // Native concurrency limiter to avoid p-limit ES6 import issues
        function createLimiter(limit) {
            let running = 0;
            const queue = [];
            
            const run = async (fn) => {
                return new Promise((resolve, reject) => {
                    queue.push({ fn, resolve, reject });
                    process();
                });
            };
            
            const process = async () => {
                if (running >= limit || queue.length === 0) return;
                
                running++;
                const { fn, resolve, reject } = queue.shift();
                
                try {
                    const result = await fn();
                    resolve(result);
                } catch (error) {
                    reject(error);
                } finally {
                    running--;
                    process();
                }
            };
            
            return run;
        }
        
        const limit = createLimiter(5); // Limit to 5 concurrent operations to avoid overwhelming system
        
        // Create chunk reading tasks
        const chunkTasks = [];
        for (let i = 0; i < session.total_chunks; i++) {
            chunkTasks.push(limit(async () => {
                const chunkPath = path.join(STORAGE_PATH, 'chunks', uploadId, `chunk_${i}`);
                console.log(`🔍 Reading chunk ${i} from: ${chunkPath}`);
                
                // Check if chunk file exists
                const chunkExists = await fs.pathExists(chunkPath);
                if (!chunkExists) {
                    throw new Error(`Chunk file not found: ${chunkPath}`);
                }
                
                const chunkData = await fs.readFile(chunkPath);
                console.log(`🔍 Chunk ${i} size: ${chunkData.length} bytes`);
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
        console.log(`🔍 Write stream ended, file assembled: ${finalPath}`);
        
        // 🚀 PARALLEL OPTIMIZATION: Clean up chunks concurrently
        const cleanupTasks = [];
        for (let i = 0; i < session.total_chunks; i++) {
            cleanupTasks.push(limit(async () => {
                const chunkPath = path.join(STORAGE_PATH, 'chunks', uploadId, `chunk_${i}`);
                try {
                    await fs.unlink(chunkPath);
                    console.log(`🧹 Cleaned up chunk: ${chunkPath}`);
                    return { success: true, path: chunkPath };
                } catch (error) {
                    console.warn(`⚠️ Could not delete chunk ${chunkPath}:`, error.message);
                    return { success: false, path: chunkPath, error: error.message };
                }
            }));
        }
        
        // Execute all cleanup operations in parallel
        const cleanupResults = await Promise.all(cleanupTasks);
        const successfulCleanups = cleanupResults.filter(r => r.success).length;
        console.log(`🧹 Cleaned up ${successfulCleanups}/${session.total_chunks} chunks`);
        
        console.log(`✅ assembleFile completed successfully: ${finalPath}`);
        return finalPath;
    } catch (error) {
        console.error(`❌ Error in assembleFile for uploadId ${uploadId}:`, error);
        throw error;
    }
}

// Multi-part upload endpoints



// Upload chunk (removed duplicate endpoint)

// Complete upload
// Import the refactored services
const FileAssemblyService = require('./services/FileAssemblyService');
const UploadValidator = require('./services/UploadValidator');
const EncryptionService = require('./services/EncryptionService');
const UploadRepository = require('./services/UploadRepository');
const { UploadCompletionService, UploadCompletionError } = require('./services/UploadCompletionService');

// Initialize upload completion service
const uploadCompletionService = new UploadCompletionService(
    pool, 
    redisManager, 
    assembleFile, 
    updateStatistics, 
    generateClipId, 
    getUploadSession
);

app.post('/api/upload/complete/:uploadId', async (req, res) => {
    try {
        const { uploadId } = req.params;
        console.log('🔍 Upload complete route started for:', uploadId);
        
        const result = await uploadCompletionService.completeUpload(uploadId, req.body, req);
        res.json(result);
        
    } catch (error) {
        console.error('❌ Error completing upload:', error);
        
        if (error instanceof UploadCompletionError) {
            return res.status(error.statusCode).json({
                error: error.message.includes('not found') ? 'Upload session not found' : 'Upload incomplete',
                message: 'Upload could not be completed'
            });
        }

        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to complete upload'
        });
    }
});

// Upload status
app.get('/api/upload/:uploadId/status', async (req, res) => {
    try {
        const { uploadId } = req.params;
        
        const session = await getUploadSession(uploadId);
        if (!session) {
            return res.status(404).json({
                error: 'Upload session not found'
            });
        }

        res.json({
            success: true,
            uploadId,
            status: session.status,
            uploadedChunks: session.uploaded_chunks,
            totalChunks: session.total_chunks,
            progress: Math.round((session.uploaded_chunks / session.total_chunks) * 100)
        });

    } catch (error) {
        console.error('❌ Error getting upload status:', error.message);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to get upload status'
        });
    }
});

// Cancel upload
app.delete('/api/upload/:uploadId', async (req, res) => {
    try {
        const { uploadId } = req.params;
        
        // Clean up chunks
        const chunkDir = path.join(STORAGE_PATH, 'chunks', uploadId);
        await fs.rm(chunkDir, { recursive: true, force: true });
        
        // Clean up database
        await pool.query('DELETE FROM file_chunks WHERE upload_id = $1', [uploadId]);
        await pool.query('DELETE FROM upload_sessions WHERE upload_id = $1', [uploadId]);
        
        if (redisManager.isConnected()) {
            await redisManager.del(`upload:${uploadId}`);
        }

        res.json({
            success: true,
            message: 'Upload cancelled'
        });

    } catch (error) {
        console.error('❌ Error cancelling upload:', error.message);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to cancel upload'
        });
    }
});

// Content-Sanitization-Funktion

// ==========================================
// UPLOAD MANAGEMENT SYSTEM
// ==========================================

// Upload ID generation
function generateUploadId() {
    return uuidv4().replace(/-/g, '').substring(0, 16).toUpperCase();
}

// Checksum calculation removed - not needed for security

// Cache helper functions
async function setCache(key, value, ttl = 3600) {
    const redis = getRedis();
    if (redis) {
        await redis.setEx(key, ttl, JSON.stringify(value));
    }
}

async function getCache(key) {
    const redis = getRedis();
    if (redis) {
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
    }
    return null;
}

// Upload rate limiting - only limit session initiation, not individual chunks
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 upload sessions per IP
    message: {
        error: 'Too many uploads',
        message: 'Upload rate limit exceeded. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getClientIP
});

// Apply upload rate limiting only to session initiation (not chunks/completion)
app.use('/api/upload/initiate', uploadLimiter);

// ==========================================
// UPLOAD ENDPOINTS
// ==========================================

// Initiate upload
app.post('/api/upload/initiate', [
    body('filename').isString().isLength({ min: 1, max: 255 }).withMessage('Valid filename required'),
    body('filesize').isInt({ min: 1, max: MAX_FILE_SIZE }).withMessage(`File size must be between 1 byte and ${MAX_FILE_SIZE} bytes`),
    body('mimeType').optional().isString().isLength({ min: 1, max: 100 }).withMessage('Valid MIME type required'),
    body('expiration').optional().isIn(['5min', '15min', '30min', '1hr', '6hr', '24hr']).withMessage('Invalid expiration time'),
    body('hasPassword').optional().isBoolean().withMessage('hasPassword must be a boolean'),
    body('oneTime').optional().isBoolean().withMessage('oneTime must be a boolean'),
    body('quickShare').optional().isBoolean().withMessage('quickShare must be a boolean'),
    body('contentType').optional().isIn(['text', 'file']).withMessage('contentType must be text or file'),
    body('isTextContent').optional().isBoolean().withMessage('isTextContent must be a boolean')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { filename, filesize, mimeType, expiration = '24hr', hasPassword = false, oneTime = false, quickShare = false, contentType = 'text', isTextContent = false } = req.body;
        
        // Set appropriate MIME type based on content type
        let finalMimeType = mimeType;
        if (isTextContent || contentType === 'text') {
            finalMimeType = 'text/plain; charset=utf-8';
        } else if (!mimeType) {
            finalMimeType = 'application/octet-stream';
        }
        
        console.log('📤 Upload Initiation Request:', {
            filename,
            filesize,
            mimeType: finalMimeType,
            expiration,
            hasPassword,
            oneTime,
            quickShare,
            contentType,
            isTextContent
        });
        
        console.log('🔐 Upload Initiation - hasPassword flag analysis:', {
            hasPasswordFromRequest: hasPassword,
            hasPasswordType: typeof hasPassword,
            willSetHasPasswordInDB: hasPassword
        });
        
        // Calculate chunks
        const totalChunks = Math.ceil(filesize / CHUNK_SIZE);
        
        // Generate upload ID
        const uploadId = generateUploadId();
        
        // Calculate expiration time
        const expirationTimes = {
            '5min': 5 * 60 * 1000,
            '15min': 15 * 60 * 1000,
            '30min': 30 * 60 * 1000,
            '1hr': 60 * 60 * 1000,
            '6hr': 6 * 60 * 60 * 1000,
            '24hr': 24 * 60 * 60 * 1000
        };
        
        const expirationTime = Date.now() + expirationTimes[expiration];

        // Store upload session in database (no client_ip stored for privacy)
        await pool.query(`
            INSERT INTO upload_sessions (
                upload_id, filename, original_filename, filesize, mime_type,
                chunk_size, total_chunks, expiration_time, has_password,
                one_time, quick_share, created_at, last_activity,
                is_text_content
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [
            uploadId, filename, filename, filesize, finalMimeType,
            CHUNK_SIZE, totalChunks, expirationTime, hasPassword,
            oneTime, quickShare, Date.now(), Date.now(),
            isTextContent || contentType === 'text'
        ]);

        // Cache session data for quick access
        await setCache(`upload:${uploadId}`, {
            uploadId, 
            filename, 
            original_filename: filename,
            filesize, 
            mime_type: finalMimeType, 
            chunk_size: CHUNK_SIZE,
            total_chunks: totalChunks, 
            uploaded_chunks: 0,
            expiration_time: expirationTime,
            has_password: hasPassword,
            one_time: oneTime,
            quick_share: quickShare,
            created_at: Date.now(),
            last_activity: Date.now(),
            is_text_content: isTextContent || contentType === 'text',
            status: 'uploading'
        });

        res.json({
            success: true,
            uploadId,
            chunkSize: CHUNK_SIZE,
            totalChunks,
            uploadUrl: `/api/upload/chunk/${uploadId}`,
            expiresAt: expirationTime
        });

    } catch (error) {
        console.error('❌ Error initiating upload:', error.message);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to initiate upload'
        });
    }
});

// Upload chunk
app.post('/api/upload/chunk/:uploadId/:chunkNumber', [
    param('uploadId').isString().isLength({ min: 16, max: 16 }).withMessage('Invalid upload ID'),
    param('chunkNumber').isInt({ min: 0 }).withMessage('Invalid chunk number')
], upload.single('chunk'), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { uploadId, chunkNumber } = req.params;
        const chunkNum = parseInt(chunkNumber);

        console.log(`📤 Chunk upload request: uploadId=${uploadId}, chunkNumber=${chunkNumber}, hasFile=${!!req.file}`);

        // Verify upload session exists and is active
        const sessionResult = await pool.query(
            'SELECT * FROM upload_sessions WHERE upload_id = $1 AND status = $2',
            [uploadId, 'uploading']
        );

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Upload session not found',
                message: 'Invalid or expired upload session'
            });
        }

        const session = sessionResult.rows[0];

        // Check if chunk number is valid
        if (chunkNum >= session.total_chunks) {
            return res.status(400).json({
                error: 'Invalid chunk number',
                message: `Chunk number must be less than ${session.total_chunks}`
            });
        }

        // Check if chunk already exists
        const existingChunk = await pool.query(
            'SELECT * FROM file_chunks WHERE upload_id = $1 AND chunk_number = $2',
            [uploadId, chunkNum]
        );

        if (existingChunk.rows.length > 0) {
            return res.status(409).json({
                error: 'Chunk already uploaded',
                message: 'This chunk has already been uploaded'
            });
        }

        // Check if file was uploaded
        if (!req.file) {
            console.log(`❌ No file uploaded for chunk ${chunkNum}`);
            return res.status(400).json({
                error: 'No chunk file provided',
                message: 'Chunk file is required'
            });
        }

        // Read chunk data from uploaded file
        const chunkData = await fs.readFile(req.file.path);
        
        // Validate chunk size
        let sizeValidationPassed = true;
        let validationMessage = '';
        
        if (session.is_text_content) {
            // For text content, encryption increases size, so we only check maximum reasonable size
            // Encrypted text can be up to ~8x larger due to IV + padding + encryption overhead
            const maxEncryptedSize = Math.max(session.chunk_size * 2, 1024 * 1024); // At least 1MB for encrypted text
            
            if (chunkData.length > maxEncryptedSize) {
                sizeValidationPassed = false;
                validationMessage = `Encrypted text chunk too large: ${chunkData.length} bytes exceeds maximum ${maxEncryptedSize} bytes`;
            }
        } else {
            // For regular files, encryption also increases size, so we need to account for that
            // Encrypted files can be larger due to IV + padding + encryption overhead
            // Allow for reasonable encryption overhead (typically 16-32 bytes for IV + padding)
            const maxEncryptedSize = session.chunk_size + 1024; // Allow 1KB overhead per chunk
            
            if (chunkData.length > maxEncryptedSize) {
                sizeValidationPassed = false;
                validationMessage = `Encrypted file chunk too large: ${chunkData.length} bytes exceeds maximum ${maxEncryptedSize} bytes`;
            }
        }
        
        if (!sizeValidationPassed) {
            // Clean up uploaded file
            await fs.unlink(req.file.path);
            return res.status(400).json({
                error: 'Chunk too large',
                message: validationMessage
            });
        }

        // Store chunk to file system
        const chunkDir = path.join(STORAGE_PATH, 'chunks', uploadId);
        await fs.mkdir(chunkDir, { recursive: true });
        const chunkPath = path.join(chunkDir, `chunk_${chunkNum}`);
        await fs.writeFile(chunkPath, chunkData);

        // Clean up temporary uploaded file
        await fs.unlink(req.file.path);

        // Store chunk metadata in database (no checksum needed)
        await pool.query(`
            INSERT INTO file_chunks (upload_id, chunk_number, chunk_size, storage_path, created_at)
            VALUES ($1, $2, $3, $4, $5)
        `, [uploadId, chunkNum, chunkData.length, chunkPath, Date.now()]);

        // Update upload session
        await pool.query(`
            UPDATE upload_sessions 
            SET uploaded_chunks = uploaded_chunks + 1, last_activity = $1
            WHERE upload_id = $2
        `, [Date.now(), uploadId]);

        // Update cache - get fresh data from database to ensure consistency
        const redis = getRedis();
        if (redis) {
            const updatedSessionResult = await pool.query(
                'SELECT * FROM upload_sessions WHERE upload_id = $1',
                [uploadId]
            );
            if (updatedSessionResult.rows[0]) {
                await redis.setEx(`upload:${uploadId}`, 3600, JSON.stringify(updatedSessionResult.rows[0]));
                console.log(`🔄 Updated Redis cache for session ${uploadId} with uploaded_chunks: ${updatedSessionResult.rows[0].uploaded_chunks}`);
            }
        }

        console.log(`✅ Chunk ${chunkNum} uploaded successfully. Progress: ${session.uploaded_chunks + 1}/${session.total_chunks}`);

        res.json({
            success: true,
            chunkNumber: chunkNum,
            received: true,
            uploadedChunks: session.uploaded_chunks + 1,
            totalChunks: session.total_chunks
        });

    } catch (error) {
        console.error('❌ Error uploading chunk:', error.message);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to upload chunk'
        });
    }
});

// Cancel upload
app.delete('/api/upload/:uploadId', [
    param('uploadId').isString().isLength({ min: 16, max: 16 }).withMessage('Invalid upload ID')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { uploadId } = req.params;

        // Get upload session
        const sessionResult = await pool.query(
            'SELECT * FROM upload_sessions WHERE upload_id = $1',
            [uploadId]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Upload session not found',
                message: 'Invalid upload session'
            });
        }

        // Get and delete all chunks
        const chunksResult = await pool.query(
            'SELECT * FROM file_chunks WHERE upload_id = $1',
            [uploadId]
        );

        // 🚀 PARALLEL OPTIMIZATION: Delete chunks concurrently for upload cancellation
        // Native concurrency limiter to avoid p-limit ES6 import issues
        function createLimiter(limit) {
            let running = 0;
            const queue = [];
            
            const run = async (fn) => {
                return new Promise((resolve, reject) => {
                    queue.push({ fn, resolve, reject });
                    process();
                });
            };
            
            const process = async () => {
                if (running >= limit || queue.length === 0) return;
                
                running++;
                const { fn, resolve, reject } = queue.shift();
                
                try {
                    const result = await fn();
                    resolve(result);
                } catch (error) {
                    reject(error);
                } finally {
                    running--;
                    process();
                }
            };
            
            return run;
        }
        
        const limit = createLimiter(10); // Allow more concurrency for file deletion
        
        const deleteTasks = chunksResult.rows.map(chunk => 
          limit(async () => {
            const result = await safeDeleteFile(chunk.storage_path);
            if (!result.success) {
              console.warn(`⚠️ Failed to delete chunk file: ${chunk.storage_path} - ${result.reason}: ${result.error}`);
            }
            return result;
          })
        );
        
        await Promise.all(deleteTasks);

        // Delete from database (order matters due to foreign key constraints)
        await pool.query('DELETE FROM file_chunks WHERE upload_id = $1', [uploadId]);
        await pool.query('DELETE FROM upload_sessions WHERE upload_id = $1', [uploadId]);

        // Clear cache
        if (redisManager.isConnected()) {
            await redisManager.del(`upload:${uploadId}`);
        }

        res.json({
            success: true,
            message: 'Upload cancelled successfully'
        });

    } catch (error) {
        console.error('❌ Error cancelling upload:', error.message);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to cancel upload'
        });
    }
});

// ==========================================
// FILE SHARING ENDPOINTS
// ==========================================

// Get file info
app.get('/api/file/:clipId/info', [
    param('clipId').custom((value) => {
        if (value.length !== 6 && value.length !== 10) {
            throw new Error('Clip ID must be 6 or 10 characters');
        }
        if (!/^[A-Z0-9]+$/.test(value)) {
            throw new Error('Clip ID must contain only uppercase letters and numbers');
        }
        return true;
    })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { clipId } = req.params;

        const result = await pool.query(
            'SELECT * FROM clips WHERE clip_id = $1 AND content_type = $2 AND is_expired = false',
            [clipId, 'file']
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'File not found',
                message: 'The requested file does not exist or has expired'
            });
        }

        const clip = result.rows[0];

        res.json({
            success: true,
            clipId: clip.clip_id,
            filename: clip.original_filename,
            filesize: clip.filesize,
            mimeType: clip.mime_type,
            expiresAt: clip.expiration_time,
            oneTime: clip.one_time,
            hasPassword: clip.password_hash === 'client-encrypted'
        });

    } catch (error) {
        console.error('❌ Error getting file info:', error.message);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to get file info'
        });
    }
});

// File page route (serves the main app for file URLs with hash)
app.get('/file/:clipId', [
    param('clipId').custom((value) => {
        if (value.length !== 6 && value.length !== 10) {
            throw new Error('Clip ID must be 6 or 10 characters');
        }
        if (!/^[A-Z0-9]+$/.test(value)) {
            throw new Error('Clip ID must contain only uppercase letters and numbers');
        }
        return true;
    })
], async (req, res) => {
    // Serve the main index.html for file URLs (for client-side routing)
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// Authenticated file download API (POST with token) - Refactored with services
app.post('/api/file/:clipId', [
    param('clipId').custom((value) => {
        if (value.length !== 6 && value.length !== 10) {
            throw new Error('Clip ID must be 6 or 10 characters');
        }
        if (!/^[A-Z0-9]+$/.test(value)) {
            throw new Error('Clip ID must contain only uppercase letters and numbers');
        }
        return true;
    }),
    body('accessCode').optional().isString().withMessage('Access code must be a string'),
    accessValidationMiddleware
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { clipId } = req.params;

        // Get clip data
        const result = await pool.query(
            'SELECT * FROM clips WHERE clip_id = $1 AND file_path IS NOT NULL AND is_expired = false',
            [clipId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'File not found',
                message: 'The requested file does not exist or has expired'
            });
        }

        const clip = result.rows[0];

        // Check if file exists on storage
        if (!(await fileService.fileExists(clip.file_path))) {
            return res.status(404).json({
                error: 'File not found on storage',
                message: 'The file has been removed from storage'
            });
        }

        // Update access statistics
        await pool.query(`
            UPDATE clips 
            SET access_count = access_count + 1, accessed_at = $1 
            WHERE clip_id = $2
        `, [Date.now(), clipId]);

        await updateStatistics('file_accessed');

        // Handle one-time access
        let deleteFileAfterSend = false;
        if (clip.one_time) {
            console.log('🔥 One-time file access, deleting clip from database:', clipId);
            await pool.query('DELETE FROM clips WHERE clip_id = $1', [clipId]);
            deleteFileAfterSend = true;
        }

        // Set download headers and stream file
        fileService.setDownloadHeaders(res, clip);
        await fileService.streamFile(clip.file_path, res, { deleteAfterSend: deleteFileAfterSend });

    } catch (error) {
        console.error('❌ Error in authenticated file download:', error.message);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to download file'
            });
        }
    }
});

// Legacy file download API (GET) - kept for backwards compatibility but returns 410 Gone
app.get('/api/file/:clipId', [
    param('clipId').custom((value) => {
        if (value.length !== 6 && value.length !== 10) {
            throw new Error('Clip ID must be 6 or 10 characters');
        }
        if (!/^[A-Z0-9]+$/.test(value)) {
            throw new Error('Clip ID must contain only uppercase letters and numbers');
        }
        return true;
    })
], async (req, res) => {
    // Return 410 Gone for security - unauthenticated downloads no longer allowed
    res.status(410).json({
        error: 'Unauthenticated downloads disabled',
        message: 'File downloads now require authentication. Please use the web interface.',
        hint: 'This security measure prevents unauthorized access to encrypted files.'
    });
});

// ==========================================
// TEXT SHARING (using new upload system for consistency)
// ==========================================

// DEPRECATED: /api/share endpoint - replaced by upload system (/api/upload/initiate + /api/upload/complete)
// This endpoint is no longer used since all text sharing now uses the unified file upload system
//
// REFACTORED VERSION: The original 245-line endpoint has been refactored into clean services:
// - ContentProcessor: /services/ContentProcessor.js (content validation and processing)
// - StorageService: /services/StorageService.js (database and file operations)  
// - QuickShareService: /services/QuickShareService.js (Quick Share specific logic)
// - ShareValidationMiddleware: /services/ShareValidationMiddleware.js (validation logic)
// Get clip info
app.get('/api/clip/:clipId/info', [
  param('clipId').custom((value) => {
    // Support both 6-character (Quick Share) and 10-character (normal) IDs
    if (value.length !== 6 && value.length !== 10) {
      throw new Error('Clip ID must be 6 or 10 characters');
    }
    if (!/^[A-Z0-9]+$/.test(value)) {
      throw new Error('Clip ID must contain only uppercase letters and numbers');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { clipId } = req.params;

    const result = await pool.query(
      'SELECT clip_id, content_type, expiration_time, one_time, password_hash, file_metadata FROM clips WHERE clip_id = $1 AND is_expired = false',
      [clipId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Clip not found',
        message: 'The requested clip does not exist or has expired'
      });
    }

    const clip = result.rows[0];

    // Debug: Show what we actually got from database
    console.log('🔍 Info endpoint clip debug:', {
      clipId: clipId,
      content_type: clip.content_type,
      file_path: !!clip.file_path,
      password_hash: !!clip.password_hash,
      password_hash_value: clip.password_hash,
      requires_access_code: clip.requires_access_code,
      requires_access_code_type: typeof clip.requires_access_code,
      access_code_hash: !!clip.access_code_hash
    });

    // NEW: Zero-Knowledge Access Code System - no download tokens needed
    const isQuickShare = clipId.length <= 6;

    if (isQuickShare) {
      console.log('⚡ Quick Share clip - no authentication required:', clipId);
    } else {
      console.log('🔐 Normal clip - checking access code requirement:', clipId);
    }

    // NEW: Determine if clip requires access code based on requires_access_code column
    let hasPassword = false;
    if (clipId.length === 10) {
      // For normal clips (10-digit), check if access code is required
      // Check both requires_access_code and password_hash for backward compatibility
      hasPassword = clip.requires_access_code || clip.password_hash === 'client-encrypted' || false;
      console.log('🔍 Clip info debug:', {
        clipId,
        contentType: clip.content_type,
        requires_access_code: clip.requires_access_code,
        requires_access_code_type: typeof clip.requires_access_code,
        password_hash: clip.password_hash,
        hasPassword
      });
    } else {
      // For Quick Share clips (6-digit), never have passwords
      hasPassword = false;
    }

    res.json({
      success: true,
      clipId: clip.clip_id,
      contentType: clip.content_type,
      expiresAt: clip.expiration_time,
      oneTime: clip.one_time,
      hasPassword: hasPassword
    });

  } catch (error) {
    console.error('❌ Error getting clip info:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get clip info'
    });
  }
});

// POST clip with access code authentication (Zero-Knowledge system)
app.post('/api/clip/:clipId', [
  param('clipId').custom((value) => {
    // Support both 6-character (Quick Share) and 10-character (normal) IDs
    if (value.length !== 6 && value.length !== 10) {
      throw new Error('Clip ID must be 6 or 10 characters');
    }
    if (!/^[A-Z0-9]+$/.test(value)) {
      throw new Error('Clip ID must contain only uppercase letters and numbers');
    }
    return true;
  }),
  body('accessCode').optional().isString().withMessage('Access code must be a string')
], async (req, res) => {
  try {
    console.log('🔐 POST /api/clip/:clipId STARTED:', req.params.clipId, 'hasAccessCode:', !!req.body?.accessCode);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { clipId } = req.params;
    const { accessCode } = req.body;

    console.log('🔐 POST /api/clip/:clipId with access code authentication:', clipId, 'hasAccessCode:', !!accessCode);

    // Get clip from database
    const result = await pool.query(
      'SELECT * FROM clips WHERE clip_id = $1 AND is_expired = false',
      [clipId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Clip not found',
        message: 'The requested clip does not exist or has expired'
      });
    }

    const clip = result.rows[0];

    // Validate access code if required
    if (clip.requires_access_code) {
      if (!accessCode) {
        console.log(`❌ Access code required but not provided for clipId: ${clipId}`);
        return res.status(401).json({
          error: 'Access code required',
          message: 'This clip requires an access code'
        });
      }
      
      // Inline access code validation to avoid reference errors
      try {
        const validationResult = await pool.query(
          'SELECT access_code_hash, requires_access_code FROM clips WHERE clip_id = $1 AND is_expired = false',
          [clipId]
        );
        
        if (validationResult.rows.length === 0) {
          console.log(`❌ Clip not found for access code validation: ${clipId}`);
          return res.status(404).json({
            error: 'Clip not found',
            message: 'The requested clip does not exist'
          });
        }
        
        const validationClip = validationResult.rows[0];
        
        // If access code required but no hash stored, deny
        if (!validationClip.access_code_hash) {
          console.log(`❌ No access code hash stored for clipId: ${clipId}`);
          return res.status(401).json({
            error: 'Access denied',
            message: 'Invalid access code configuration'
          });
        }
        
        // Check if provided access code matches stored hash
        const isAlreadyHashed = accessCode.length === 128 && /^[a-f0-9]+$/i.test(accessCode);
        let providedHash;
        
        if (isAlreadyHashed) {
          console.log('🔐 Using client-side hashed access code for validation');
          providedHash = accessCode;
                 } else {
           console.log('🔐 Generating server-side access code hash for validation');
           // Inline hash generation to avoid reference errors
           const crypto = require('crypto');
           providedHash = await new Promise((resolve, reject) => {
             crypto.pbkdf2(accessCode, process.env.PBKDF2_SALT || 'qopy-access-salt-v1', 100000, 64, 'sha512', (err, derivedKey) => {
               if (err) reject(err);
               else resolve(derivedKey.toString('hex'));
             });
           });
         }
        
        if (providedHash !== validationClip.access_code_hash) {
          console.log(`❌ Invalid access code for clipId: ${clipId}`);
          return res.status(401).json({
            error: 'Access denied',
            message: 'Invalid access code'
          });
        }
        
        console.log(`✅ Access code validated for clipId: ${clipId}`);
      } catch (validateError) {
        console.error('❌ Error validating access code:', validateError);
        return res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to validate access code'
        });
      }
      console.log(`✅ Access code validated for clipId: ${clipId}`);
    }

    // Continue with same logic as GET endpoint...
    return await handleClipRetrieval(req, res, clip, clipId);
  } catch (error) {
    console.error('❌ Error in POST /api/clip/:clipId:', error);
    if (process.env.NODE_ENV !== 'production') {
      console.error('❌ Error stack:', error.stack);
    }
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve clip'
    });
  }
});

// Get clip (Zero-Knowledge system - no authentication for URL-secret-only clips)
app.get('/api/clip/:clipId', [
  param('clipId').custom((value) => {
    // Support both 6-character (Quick Share) and 10-character (normal) IDs
    if (value.length !== 6 && value.length !== 10) {
      throw new Error('Clip ID must be 6 or 10 characters');
    }
    if (!/^[A-Z0-9]+$/.test(value)) {
      throw new Error('Clip ID must contain only uppercase letters and numbers');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { clipId } = req.params;

    console.log('🔐 GET /api/clip/:clipId Zero-Knowledge request:', clipId);

    // Get clip from database
    const result = await pool.query(
      'SELECT * FROM clips WHERE clip_id = $1 AND is_expired = false',
      [clipId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Clip not found',
        message: 'The requested clip does not exist or has expired'
      });
    }

    const clip = result.rows[0];

    // Debug: Show what we actually got from database
    console.log('🔍 Main endpoint clip debug:', {
      clipId: clipId,
      content_type: clip.content_type,
      file_path: !!clip.file_path,
      password_hash: !!clip.password_hash
    });

    // Zero-Knowledge system: Check if access code is required
    if (clip.requires_access_code) {
      console.log(`❌ Access code required for clipId: ${clipId}, use POST endpoint`);
      return res.status(401).json({
        error: 'Access code required',
        message: 'This clip requires an access code. Use POST request with access code.',
        requiresAccessCode: true
      });
    }

    const isQuickShare = clipId.length <= 6;
    console.log(`✅ Zero-Knowledge GET access granted for clipId: ${clipId}, isQuickShare: ${isQuickShare}`);

    // Use shared clip retrieval logic
    return await handleClipRetrieval(req, res, clip, clipId);
  } catch (error) {
    console.error('❌ Error in GET /api/clip/:clipId:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve clip'
    });
  }
});

// Admin authentication middleware
function requireAdminAuth(req, res, next) {
  const adminToken = process.env.ADMIN_TOKEN;
  
  if (!adminToken) {
    console.error('❌ ADMIN_TOKEN environment variable not set');
    return res.status(500).json({
      error: 'Admin authentication not configured',
      message: 'Please set ADMIN_TOKEN environment variable'
    });
  }
  
  // For API requests, check Authorization header
  if (req.path.startsWith('/api/admin/')) {
    const authHeader = req.headers.authorization;
    const expected = `Bearer ${adminToken}`;
    if (!authHeader || authHeader.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid admin token'
      });
    }
  }
  
  next();
}

// Admin authentication endpoint
app.post('/api/admin/auth', [
  body('password').isLength({ min: 1, max: 128 }).withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { password } = req.body;
    const adminToken = process.env.ADMIN_TOKEN;
    
    if (!adminToken) {
      console.error('❌ ADMIN_TOKEN environment variable not set');
      return res.status(500).json({
        error: 'Admin authentication not configured',
        message: 'Please set ADMIN_TOKEN environment variable'
      });
    }
    
    const pwBuf = Buffer.from(String(password));
    const tkBuf = Buffer.from(String(adminToken));
    if (pwBuf.length === tkBuf.length && crypto.timingSafeEqual(pwBuf, tkBuf)) {
      res.json({
        success: true,
        message: 'Authentication successful'
      });
    } else {
      res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid admin password'
      });
    }
  } catch (error) {
    console.error('❌ Admin authentication error:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication failed'
    });
  }
});

// Admin routes
app.get('/admin', (req, res) => {
  // Check if admin token is configured
  if (!process.env.ADMIN_TOKEN) {
    return res.status(500).send(`
      <html>
        <head><title>Admin Not Configured</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1>🔧 Admin Dashboard Not Configured</h1>
          <p>The ADMIN_TOKEN environment variable is not set.</p>
          <p>Please configure the admin token in your Railway environment variables.</p>
        </body>
      </html>
    `);
  }
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Protected Admin statistics
app.get('/api/admin/stats', requireAdminAuth, async (req, res) => {
  try {
    // Get statistics from dedicated table (much faster than COUNT queries)
    const statsResult = await pool.query('SELECT * FROM statistics ORDER BY id DESC LIMIT 1');
    const stats = statsResult.rows[0];
    
    // Get active clips (not expired) - still need to query clips table for this
    const activeResult = await pool.query('SELECT COUNT(*) as count FROM clips WHERE is_expired = false');
    const activeClips = parseInt(activeResult.rows[0].count);

    // Calculate percentages
    const totalClips = parseInt(stats.total_clips);
    const passwordPercentage = totalClips > 0 ? Math.round((parseInt(stats.password_protected_clips) / totalClips) * 100) : 0;
    const quickSharePercentage = totalClips > 0 ? Math.round((parseInt(stats.quick_share_clips) / totalClips) * 100) : 0;

    res.json({
      totalClips,
      activeClips,
      totalAccesses: parseInt(stats.total_accesses),
      passwordClips: parseInt(stats.password_protected_clips),
      passwordPercentage,
      quickShareClips: parseInt(stats.quick_share_clips),
      quickSharePercentage,
      oneTimeClips: parseInt(stats.one_time_clips),
      normalClips: parseInt(stats.normal_clips),
      lastUpdated: stats.last_updated
    });
  } catch (error) {
    console.error('❌ Error getting admin stats:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get statistics'
    });
  }
});

// Protected Admin recent clips
app.get('/api/admin/clips', requireAdminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT clip_id, content, created_at, expiration_time, is_expired, 
             access_count, password_hash IS NOT NULL as has_password, one_time
      FROM clips 
      ORDER BY created_at DESC 
      LIMIT 20
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error getting admin clips:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get clips'
    });
  }
});

// Protected Admin system info
app.get('/api/admin/system', requireAdminAuth, async (req, res) => {
  try {
    // Test database connection
    const dbTest = await pool.query('SELECT NOW() as current_time');
    
    res.json({
      status: 'OK',
      version: 'minimal-1.0.0',
      environment: process.env.NODE_ENV || 'production',
      database: 'Connected',
      lastCleanup: new Date().toLocaleString(),
      currentTime: dbTest.rows[0].current_time
    });
  } catch (error) {
    console.error('❌ Error getting system info:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get system information'
    });
  }
});

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
  console.error('❌ Unhandled error:', err);
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

// Set up periodic tasks
// Comprehensive cleanup every minute
const cleanupInterval = setInterval(async () => {
  await cleanupExpiredClips();
  await cleanupExpiredUploads();
}, 60 * 1000); // Every minute

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
        console.error('❌ Error updating statistics:', error.message);
    }
}

// Graceful shutdown
async function gracefulShutdown(signal = 'SIGTERM') {
    console.log(`🛑 Graceful shutdown initiated [${signal}]`);
    
    // Clear cleanup interval
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
    }

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
            console.log('📕 Disconnecting Redis...');
            await redisManager.disconnect();
            console.log('✅ Redis disconnected gracefully');
        }
        
        // Close database connection pool
        console.log('🗄️ Closing database pool...');
        await pool.end();
        console.log('✅ Database pool closed');
        
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
