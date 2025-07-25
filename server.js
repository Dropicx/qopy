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
 *    For proprietary/commercial use. Contact qopy@lit.services
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

// File storage configuration (define before multer config)
const STORAGE_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || './uploads';
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// Configure multer for file uploads
const upload = multer({
    storage: multer.diskStorage({
        destination: function (req, file, cb) {
            // Use a temporary directory for chunk uploads
            const tempDir = path.join(STORAGE_PATH, 'temp');
            try {
                fs.ensureDirSync(tempDir);
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
        fileSize: CHUNK_SIZE // 5MB per chunk
    }
});

// Redis setup (optional, falls verfügbar)
let redis = null;
try {
    const Redis = require('redis');
    if (process.env.REDIS_URL) {
        redis = Redis.createClient({
            url: process.env.REDIS_URL
        });
        redis.connect();
        console.log('✅ Redis connected');
    }
} catch (error) {
    console.warn('⚠️ Redis not available, using in-memory cache');
}

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

// Create PostgreSQL connection pool with retry logic
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: process.env.NODE_ENV === 'production' ? 100 : 10, // 100 für Produktion, 10 für Development
    min: process.env.NODE_ENV === 'production' ? 10 : 2,   // Mindestens 10 Connections in Produktion
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    retryDelay: 1000,
    maxRetries: 3,
    // Zusätzliche Performance-Optimierungen
    allowExitOnIdle: false, // Verhindert unerwartetes Schließen
    maxUses: 7500, // Connection nach 7500 Queries neu erstellen (Memory-Leak Prevention)
});

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

// ENHANCED HEALTH CHECK with database test
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    const client = await pool.connect();
    await client.query('SELECT NOW() as current_time');
    client.release();
    
    res.status(200).json({
      status: 'OK',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: 'minimal-1.0.0',
      database: 'connected'
    });
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    res.status(503).json({
      status: 'ERROR',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: 'minimal-1.0.0',
      database: 'disconnected',
      error: error.message
    });
  }
});

// API health check (for compatibility)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: 'minimal-1.0.0'
  });
});

// Simple ping endpoint
app.get('/ping', (req, res) => {
  res.json({ 
    pong: true, 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Debug endpoint to check file encryption status
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
    
    const chunks = chunksResult.rows.map(chunk => {
      const chunkPath = path.join(STORAGE_PATH, 'chunks', chunk.storage_path);
      return {
        chunkNumber: chunk.chunk_number,
        storagePath: chunk.storage_path,
        chunkSize: chunk.chunk_size,
        exists: fs.existsSync(chunkPath),
        actualSize: fs.existsSync(chunkPath) ? fs.statSync(chunkPath).size : 0
      };
    });
    
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
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Secure CORS Configuration
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        
        // Explicitly block Chrome Extensions and other potentially malicious origins
        if (origin.startsWith('chrome-extension://') || 
            origin.startsWith('moz-extension://') || 
            origin.startsWith('safari-extension://') ||
            origin.startsWith('ms-browser-extension://')) {
            console.warn(`🚫 BLOCKED: Browser extension origin: ${origin}`);
            return callback(new Error('Browser extensions are not allowed'));
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
    // Skip rate limiting for health checks and admin routes
    return req.path === '/health' || req.path === '/api/health' || req.path === '/ping' || req.path.startsWith('/api/admin/');
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
    // Skip burst limiting for health checks and admin routes
    return req.path === '/health' || req.path === '/api/health' || req.path === '/ping' || req.path.startsWith('/api/admin/');
  }
});

// Apply rate limiting (order matters - most specific first)
app.use('/api/', logRateLimitEvent); // Logging first
app.use('/api/', burstLimiter); // Burst protection
app.use('/api/', generalLimiter); // General protection
app.use('/api/share', shareLimiter); // Share-specific protection
app.use('/api/clip/', retrieveLimiter); // Retrieval-specific protection

// Serve static files (before API routes)
app.use(express.static('public'));

// Explicit static file routes to prevent conflicts with /clip/ routes
app.get('/script.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'script.js'));
});

app.get('/styles.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'styles.css'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Explicit routes for static files under /clip/ to prevent conflicts
app.get('/clip/script.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'script.js'));
});

app.get('/clip/styles.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'styles.css'));
});

app.get('/clip/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/clip/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Font routes to prevent conflicts with /clip/ routes
app.get('/clip/fonts/Inter-Regular.woff2', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'fonts', 'Inter-Regular.woff2'));
});

app.get('/clip/fonts/Inter-Medium.woff2', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'fonts', 'Inter-Medium.woff2'));
});

app.get('/clip/fonts/Inter-SemiBold.woff2', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'fonts', 'Inter-SemiBold.woff2'));
});

app.get('/clip/fonts/Inter-Bold.woff2', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'fonts', 'Inter-Bold.woff2'));
});

app.get('/clip/fonts/Inter-ExtraBold.woff2', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'fonts', 'Inter-ExtraBold.woff2'));
});

// QR Code library route
app.get('/qrcode.min.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qrcode.min.js'));
});

app.get('/clip/qrcode.min.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qrcode.min.js'));
});

// Logo routes to prevent conflicts with /clip/ routes
app.get('/clip/logos/Favicon.png', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'logos', 'Favicon.png'));
});

app.get('/clip/logos/Main Qopy logo.png', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'logos', 'Main Qopy logo.png'));
});

// Explicit favicon routes for better browser compatibility
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'logos', 'Favicon.png'));
});

app.get('/apple-touch-icon.png', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'logos', 'Favicon.png'));
});

// Clip ID generation
function generateClipId(quickShare = false) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  const length = quickShare ? 4 : 10; // 4 für Quick Share, 10 für normale Shares
  
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
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
        
        for (const chunk of chunks.rows) {
          const result = await safeDeleteFile(chunk.storage_path);
          if (!result.success) {
            console.warn(`⚠️ Failed to delete chunk file: ${chunk.storage_path} - ${result.reason}: ${result.error}`);
          }
        }
        
        // Delete database records
        await pool.query('DELETE FROM file_chunks WHERE upload_id = $1', [uploadId]);
        await pool.query('DELETE FROM upload_sessions WHERE upload_id = $1', [uploadId]);
        
        // Clear cache
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
    
    if (redis) {
        await redis.setEx(`upload:${sessionData.uploadId}`, 3600, JSON.stringify(sessionData));
        console.log(`✅ Cached session in Redis: ${sessionData.uploadId}`);
    }
    
    return sessionData;
}

async function getUploadSession(uploadId) {
    console.log(`🔍 Getting upload session: ${uploadId}`);
    
    if (redis) {
        const cached = await redis.get(`upload:${uploadId}`);
        if (cached) {
            console.log(`✅ Found session in Redis: ${uploadId}`);
            return JSON.parse(cached);
        }
    }
    
    // Fallback to database
    const result = await pool.query(
        'SELECT * FROM upload_sessions WHERE upload_id = $1',
        [uploadId]
    );
    
    if (result.rows[0]) {
        console.log(`✅ Found session in database: ${uploadId}, uploaded_chunks: ${result.rows[0].uploaded_chunks}/${result.rows[0].total_chunks}`);
    } else {
        console.log(`❌ Session not found in database: ${uploadId}`);
    }
    
    return result.rows[0] || null;
}

async function updateUploadSession(uploadId, updates) {
    console.log(`🔄 Updating upload session: ${uploadId}, uploaded_chunks: ${updates.uploaded_chunks}, status: ${updates.status}`);
    await pool.query(
        'UPDATE upload_sessions SET uploaded_chunks = $1, last_activity = $2, status = $3 WHERE upload_id = $4',
        [updates.uploaded_chunks, Date.now(), updates.status || 'uploading', uploadId]
    );
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
    const finalPath = path.join(STORAGE_PATH, 'files', `${uploadId}_${session.filename}`);
    await fs.mkdir(path.dirname(finalPath), { recursive: true });
    
    const writeStream = require('fs').createWriteStream(finalPath);
    
    for (let i = 0; i < session.total_chunks; i++) {
        // Use the same path format as chunk upload: ${uploadId}_${chunkNumber}.chunk
        const chunkPath = path.join(STORAGE_PATH, 'chunks', `${uploadId}_${i}.chunk`);
        console.log(`🔍 Reading chunk from: ${chunkPath}`);
        const chunkData = await fs.readFile(chunkPath);
        writeStream.write(chunkData);
    }
    
    writeStream.end();
    
    // Clean up chunks - remove individual chunk files (not directory)
    for (let i = 0; i < session.total_chunks; i++) {
        const chunkPath = path.join(STORAGE_PATH, 'chunks', `${uploadId}_${i}.chunk`);
        try {
            await fs.unlink(chunkPath);
            console.log(`🧹 Cleaned up chunk: ${chunkPath}`);
        } catch (error) {
            console.warn(`⚠️ Could not delete chunk ${chunkPath}:`, error.message);
        }
    }
    
    return finalPath;
}

// Multi-part upload endpoints



// Upload chunk (removed duplicate endpoint)

// Complete upload
app.post('/api/upload/complete/:uploadId', async (req, res) => {
    try {
        const { uploadId } = req.params;
        const { quickShareSecret, password, urlSecret } = req.body;
        console.log('🔑 Upload complete request body:', { 
            quickShareSecret: quickShareSecret,
            hasPassword: !!password,
            hasUrlSecret: !!urlSecret
        });
        
        const session = await getUploadSession(uploadId);
        if (!session) {
            return res.status(404).json({
                error: 'Upload session not found',
                message: 'Invalid upload ID or session expired'
            });
        }
        
        console.log('🔑 Upload session details:', { 
            uploadId: session.upload_id, 
            quick_share: session.quick_share, 
            has_password: session.has_password,
            is_text_content: session.is_text_content
        });

        // Ensure expiration_time is set (fallback to 24 hours if missing)
        if (!session.expiration_time) {
            console.warn(`⚠️ Missing expiration_time for session ${uploadId}, using 24 hours as fallback`);
            session.expiration_time = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
        }

        if (session.uploaded_chunks < session.total_chunks) {
            return res.status(400).json({
                error: 'Upload incomplete',
                message: `Only ${session.uploaded_chunks}/${session.total_chunks} chunks uploaded`
            });
        }

        // Assemble file
        const filePath = await assembleFile(uploadId, session);
        
        // Get actual file size (may be different from original if encrypted)
        const actualFileSize = (await fs.stat(filePath)).size;
        
        // Create clip - use quick_share setting for text content, normal IDs for files
        const clipId = generateClipId(session.is_text_content ? session.quick_share : false);
        
        // All content is now stored as files (no database content storage)
        let isFile = true;
        
        if (session.is_text_content) {
            console.log(`📝 Text content stored as file: ${filePath} (${actualFileSize} bytes encrypted)`);
        }

        // Handle Quick Share secret and password hash
        let passwordHash = null;
        if (session.quick_share && quickShareSecret) {
            console.log('🔑 Setting Quick Share secret for upload:', uploadId, 'secret:', quickShareSecret);
            passwordHash = quickShareSecret;
        } else if (session.has_password) {
            // Only set 'client-encrypted' for actual user passwords, not for URL secrets
            passwordHash = 'client-encrypted';
        } else {
            // For normal text shares with URL secret but no user password, set to null
            passwordHash = null;
        }

        // Generate download token BEFORE JSON.stringify
        let downloadToken = null;
        
        // For file uploads, generate token if urlSecret is present (password optional)
        // For text uploads, handle Quick Share vs Normal mode differently
        const isFileUpload = !session.is_text_content || session.original_filename !== `${uploadId.substring(0, 8)}.txt`;
        
        if (isFileUpload) {
            // File uploads: generate token if urlSecret is present (password is optional)
            if (urlSecret) {
                downloadToken = await generateDownloadToken(clipId, password, urlSecret);
                console.log('🔐 Generated download token for file upload:', clipId, 'hasPassword:', !!password, 'hasUrlSecret:', !!urlSecret);
            } else {
                console.log('⚠️ No urlSecret provided for file upload - no download token generated');
            }
        } else {
            // Text uploads: handle Quick Share vs Normal mode
            if (session.quick_share) {
                // Quick Share: No download token needed - uses quickShareSecret in password_hash field
                downloadToken = null;
                console.log('⚡ Quick Share text upload - no download token needed (uses quickShareSecret)');
            } else {
                // Normal text: generate token if urlSecret is present (password is optional for URL-only protection)
                if (urlSecret) {
                    downloadToken = await generateDownloadToken(clipId, password, urlSecret);
                    console.log('🔐 Generated download token for normal text upload:', clipId, 'hasPassword:', !!password, 'hasUrlSecret:', !!urlSecret);
                } else {
                    console.log('ℹ️ Normal text upload without urlSecret - no download token generated');
                }
            }
        }

        // Create file metadata object
        const fileMetadata = {
            uploadId,
            originalUploadSession: true,
            originalFileSize: session.filesize, // Store original size in metadata
            actualFileSize: actualFileSize,
            downloadToken: downloadToken
        };

        console.log('📝 Storing file_metadata:', fileMetadata);

        // Store clip in database (content column removed - all content stored as files)
        await pool.query(`
            INSERT INTO clips 
            (clip_id, content_type, expiration_time, password_hash, one_time, quick_share, created_at,
             file_path, original_filename, mime_type, filesize, is_file, file_metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
            clipId,
            // Keep content_type = 'text' for text content, even when stored as file
            session.is_text_content ? 'text' : 'file',
            session.expiration_time,
            passwordHash, // Use the calculated password hash (Quick Share secret or 'client-encrypted')
            session.one_time,
            session.quick_share, // Add quick_share from session
            Date.now(),
            isFile ? filePath : null,
            session.original_filename,
            session.mime_type,
            actualFileSize, // Use actual file size (encrypted if applicable)
            isFile,
            JSON.stringify(fileMetadata)
        ]);

        // Update statistics
        await updateStatistics('clip_created');
        
        if (session.quick_share) {
            await updateStatistics('quick_share_created');
        } else if (session.has_password) {
            await updateStatistics('password_protected_created');
        } else {
            await updateStatistics('normal_created');
        }
        
        if (session.one_time) {
            await updateStatistics('one_time_created');
        }

        // Clean up upload session (order matters due to foreign key constraints)
        await pool.query('DELETE FROM file_chunks WHERE upload_id = $1', [uploadId]);
        await pool.query('DELETE FROM upload_sessions WHERE upload_id = $1', [uploadId]);
        
        if (redis) {
            await redis.del(`upload:${uploadId}`);
        }

        res.json({
            success: true,
            clipId,
            // Use /clip/ URL for text content, /file/ URL for regular files
            url: session.is_text_content 
                ? `${req.protocol}://${req.get('host')}/clip/${clipId}`
                : `${req.protocol}://${req.get('host')}/file/${clipId}`,
            filename: session.original_filename,
            filesize: session.filesize, // Return original size for display
            expiresAt: session.expiration_time,
            quickShare: session.quick_share, // Include Quick Share flag for client
            oneTime: session.one_time, // Include one-time flag for client
            isFile: isFile
        });

    } catch (error) {
        console.error('❌ Error completing upload:', error.message);
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
        
        if (redis) {
            await redis.del(`upload:${uploadId}`);
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

// Calculate SHA256 checksum for chunk validation
function calculateChecksum(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

// Cache helper functions
async function setCache(key, value, ttl = 3600) {
    if (redis) {
        await redis.setEx(key, ttl, JSON.stringify(value));
    }
}

async function getCache(key) {
    if (redis) {
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
    }
    return null;
}

// Upload rate limiting
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

// Apply upload rate limiting
app.use('/api/upload', uploadLimiter);

// ==========================================
// UPLOAD ENDPOINTS
// ==========================================

// Initiate upload
app.post('/api/upload/initiate', [
    body('filename').isString().isLength({ min: 1, max: 255 }).withMessage('Valid filename required'),
    body('filesize').isInt({ min: 1, max: MAX_FILE_SIZE }).withMessage(`File size must be between 1 byte and ${MAX_FILE_SIZE} bytes`),
    body('mimeType').isString().isLength({ min: 1, max: 100 }).withMessage('Valid MIME type required'),
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
        const clientIP = getClientIP(req);
        
        // Store upload session in database
        await pool.query(`
            INSERT INTO upload_sessions (
                upload_id, filename, original_filename, filesize, mime_type, 
                chunk_size, total_chunks, expiration_time, has_password, 
                one_time, quick_share, client_ip, created_at, last_activity,
                is_text_content
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
            uploadId, filename, filename, filesize, mimeType,
            CHUNK_SIZE, totalChunks, expirationTime, hasPassword,
            oneTime, quickShare, clientIP, Date.now(), Date.now(),
            isTextContent || contentType === 'text'
        ]);

        // Cache session data for quick access
        await setCache(`upload:${uploadId}`, {
            uploadId, 
            filename, 
            original_filename: filename,
            filesize, 
            mime_type: mimeType, 
            chunk_size: CHUNK_SIZE,
            total_chunks: totalChunks, 
            uploaded_chunks: 0,
            expiration_time: expirationTime,
            has_password: hasPassword,
            one_time: oneTime,
            quick_share: quickShare,
            client_ip: clientIP,
            created_at: Date.now(),
            last_activity: Date.now(),
            is_text_content: isTextContent || contentType === 'text',
            status: 'uploading',
            checksums: []
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

        // Calculate checksum
        const checksum = calculateChecksum(chunkData);
        
        // Store chunk to file system
        const chunkPath = path.join(STORAGE_PATH, 'chunks', `${uploadId}_${chunkNum}.chunk`);
        await fs.writeFile(chunkPath, chunkData);

        // Clean up temporary uploaded file
        await fs.unlink(req.file.path);

        // Store chunk metadata in database
        await pool.query(`
            INSERT INTO file_chunks (upload_id, chunk_number, chunk_size, checksum, storage_path, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [uploadId, chunkNum, chunkData.length, checksum, chunkPath, Date.now()]);

        // Update upload session
        await pool.query(`
            UPDATE upload_sessions 
            SET uploaded_chunks = uploaded_chunks + 1, last_activity = $1
            WHERE upload_id = $2
        `, [Date.now(), uploadId]);

        // Update cache - get fresh data from database to ensure consistency
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
            checksum,
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

// ===== DUPLICATE ENDPOINT REMOVED FOR CONSISTENCY =====
// The redundant upload/complete endpoint has been removed to prevent conflicts.
// Only the primary endpoint (with download token support) remains active.

// Get upload status
app.get('/api/upload/:uploadId/status', [
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

        // Check cache first
        const cachedSession = await getCache(`upload:${uploadId}`);
        if (cachedSession) {
            return res.json({
                success: true,
                status: 'uploading',
                uploadedChunks: cachedSession.chunksUploaded,
                totalChunks: cachedSession.totalChunks,
                progress: (cachedSession.chunksUploaded / cachedSession.totalChunks) * 100
            });
        }

        // Fallback to database
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

        const session = sessionResult.rows[0];

        res.json({
            success: true,
            status: session.status,
            uploadedChunks: session.uploaded_chunks,
            totalChunks: session.total_chunks,
            progress: (session.uploaded_chunks / session.total_chunks) * 100,
            filename: session.original_filename,
            filesize: session.filesize,
            mimeType: session.mime_type
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

        for (const chunk of chunksResult.rows) {
            const result = await safeDeleteFile(chunk.storage_path);
            if (!result.success) {
                console.warn(`⚠️ Failed to delete chunk file: ${chunk.storage_path} - ${result.reason}: ${result.error}`);
            }
        }

        // Delete from database (order matters due to foreign key constraints)
        await pool.query('DELETE FROM file_chunks WHERE upload_id = $1', [uploadId]);
        await pool.query('DELETE FROM upload_sessions WHERE upload_id = $1', [uploadId]);

        // Clear cache
        if (redis) {
            await redis.del(`upload:${uploadId}`);
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
        if (value.length !== 4 && value.length !== 10) {
            throw new Error('Clip ID must be 4 or 10 characters');
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
        if (value.length !== 4 && value.length !== 10) {
            throw new Error('Clip ID must be 4 or 10 characters');
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

// Helper function to generate download token (same algorithm as client)
async function generateDownloadToken(clipId, password, urlSecret) {
    const crypto = require('crypto');
    
    let tokenData = clipId;
    
    if (urlSecret) {
        tokenData += ':' + urlSecret;
    }
    
    if (password) {
        tokenData += ':' + password;
    }
    
    const hash = crypto.createHash('sha256');
    hash.update(tokenData);
    return hash.digest('hex');
}

// Helper function to validate download token against clip
async function validateDownloadToken(clipId, providedToken) {
    try {
        const result = await pool.query(
            'SELECT password_hash, content_type, file_path FROM clips WHERE clip_id = $1 AND is_expired = false',
            [clipId]
        );
        
        if (result.rows.length === 0) {
            return false;
        }
        
        const clip = result.rows[0];
        
        // For Quick Share clips (4-digit), the password_hash contains the secret
        if (clipId.length === 4 && clip.password_hash) {
            const expectedToken = await generateDownloadToken(clipId, null, clip.password_hash);
            return providedToken === expectedToken;
        }
        
        // For normal clips (10-digit), check if we have a stored download token
        // This was computed during upload and stored for validation
        if (clipId.length === 10) {
            // Try to find a stored download token in the file_metadata
            try {
                const metadataResult = await pool.query(
                    'SELECT file_metadata FROM clips WHERE clip_id = $1 AND is_expired = false',
                    [clipId]
                );
                
                if (metadataResult.rows.length > 0 && metadataResult.rows[0].file_metadata) {
                    const rawMetadata = metadataResult.rows[0].file_metadata;
                    console.log('🔍 Raw file_metadata for clipId:', clipId, 'type:', typeof rawMetadata, 'value:', rawMetadata);
                    
                    let metadata;
                    
                    // Check if it's already an object or if it's a JSON string
                    if (typeof rawMetadata === 'object') {
                        // Already parsed by PostgreSQL
                        metadata = rawMetadata;
                        console.log('📝 Using metadata as object (already parsed by PostgreSQL):', metadata);
                    } else {
                        // Need to parse JSON string
                        try {
                            metadata = JSON.parse(rawMetadata);
                            console.log('📝 Parsed metadata from JSON string successfully:', metadata);
                        } catch (parseError) {
                            console.error('❌ Failed to parse file_metadata as JSON for clipId:', clipId, 'error:', parseError.message, 'raw data:', rawMetadata);
                            return false;
                        }
                    }
                    
                    if (metadata.downloadToken) {
                        console.log('✅ Found stored download token for clipId:', clipId, 'comparing with provided token');
                        console.log('🔐 Stored token:', metadata.downloadToken);
                        console.log('🔐 Provided token:', providedToken);
                        return providedToken === metadata.downloadToken;
                    } else {
                        console.log('❌ No download token found in metadata for clipId:', clipId, 'metadata keys:', Object.keys(metadata));
                        
                        // Fallback for clips created before token system was implemented
                        console.log('🔄 Falling back to legacy validation for clipId:', clipId);
                        
                        // For normal clips, be strict - they should have stored tokens
                        console.log('❌ Normal clip without stored token - denying access for security');
                        
                        // Normal clips created after the token system implementation should always have tokens
                        // Deny access to maintain security - no legacy fallback for normal clips
                        return false;
                    }
                } else {
                    console.log('❌ No file_metadata found for clipId:', clipId);
                    
                    // If no metadata exists, deny access for security
                    console.log('❌ Normal clip without metadata - denying access for security');
                    return false;
                }
            } catch (error) {
                console.error('❌ Error checking file metadata for download token:', error);
                // For normal clips, deny on errors for security
                return false;
            }
        }
        
        return false;
    } catch (error) {
        console.error('❌ Error validating download token:', error);
        return false;
    }
}

// Authenticated file download API (POST with token)
app.post('/api/file/:clipId', [
    param('clipId').custom((value) => {
        if (value.length !== 4 && value.length !== 10) {
            throw new Error('Clip ID must be 4 or 10 characters');
        }
        if (!/^[A-Z0-9]+$/.test(value)) {
            throw new Error('Clip ID must contain only uppercase letters and numbers');
        }
        return true;
    }),
    body('downloadToken').optional().isString().isLength({ min: 64, max: 64 }).withMessage('Download token must be 64 characters')
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
        const { downloadToken } = req.body;

        console.log(`🔐 Authenticated download request for clipId: ${clipId}`);

        // Check if this is Quick Share (4-digit) - Quick Share doesn't use download tokens
        const isQuickShare = clipId.length === 4;
        
        if (!isQuickShare) {
            // Normal clips require download token
            if (!downloadToken) {
                console.log(`❌ No download token provided for normal clip: ${clipId}`);
                return res.status(401).json({
                    error: 'Authentication required',
                    message: 'Download token required for this file'
                });
            }
            
            // Validate download token for normal clips only
            const tokenValid = await validateDownloadToken(clipId, downloadToken);
            if (!tokenValid) {
                console.log(`❌ Invalid download token for clipId: ${clipId}`);
                return res.status(401).json({
                    error: 'Authentication failed',
                    message: 'Invalid download token - wrong password or URL secret'
                });
            }
            console.log(`✅ Download token validated for clipId: ${clipId}`);
        } else {
            console.log(`⚡ Quick Share download - no token validation needed for clipId: ${clipId}`);
        }

        // Continue with existing download logic...
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

        // Update access statistics
        await pool.query(`
            UPDATE clips 
            SET access_count = access_count + 1, accessed_at = $1 
            WHERE clip_id = $2
        `, [Date.now(), clipId]);

        await updateStatistics('file_accessed');

        // Handle one-time access - delete clip and schedule file deletion after response
        let deleteFileAfterSend = false;
        if (clip.one_time) {
            console.log('🔥 One-time file access, deleting clip from database:', clipId);
            await pool.query('DELETE FROM clips WHERE clip_id = $1', [clipId]);
            deleteFileAfterSend = true;
        }

        // Check if file exists
        try {
            await fs.access(clip.file_path);
        } catch (error) {
            return res.status(404).json({
                error: 'File not found on storage',
                message: 'The file has been removed from storage'
            });
        }

        // Set appropriate headers
        res.setHeader('Content-Type', clip.mime_type || 'application/octet-stream');
        res.setHeader('Content-Length', clip.filesize);
        res.setHeader('Content-Disposition', `attachment; filename="${clip.original_filename}"`);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

        // Stream file to client
        const fileStream = fs.createReadStream(clip.file_path);
        fileStream.pipe(res);

        fileStream.on('error', (error) => {
            console.error('❌ Error streaming file:', error.message);
            if (!res.headersSent) {
                res.status(500).json({
                    error: 'File stream error',
                    message: 'Failed to stream file'
                });
            }
        });

        // Delete file after successful streaming for one-time access
        if (deleteFileAfterSend) {
            fileStream.on('end', async () => {
                try {
                    await fs.unlink(clip.file_path);
                    console.log('🧹 Deleted one-time file after streaming:', clip.file_path);
                } catch (fileError) {
                    console.warn('⚠️ Could not delete one-time file:', fileError.message);
                }
            });
        }

    } catch (error) {
        console.error('❌ Error in authenticated file download:', error.message);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to download file'
        });
    }
});

// Legacy file download API (GET) - kept for backwards compatibility but returns 410 Gone
app.get('/api/file/:clipId', [
    param('clipId').custom((value) => {
        if (value.length !== 4 && value.length !== 10) {
            throw new Error('Clip ID must be 4 or 10 characters');
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

// Create share - handles both text and binary content using unified approach
app.post('/api/share', [
  body('content').custom((value) => {
    // Validate content as binary array or string
    if (Array.isArray(value)) {
      // New format: binary array
      if (value.length === 0) {
        throw new Error('Content cannot be empty');
      }
      if (value.length > 400000) {
        throw new Error('Content too large (max 400KB)');
      }
      // Validate all elements are numbers
      if (!value.every(item => typeof item === 'number' && item >= 0 && item <= 255)) {
        throw new Error('Invalid binary data format');
      }
      return true;
    } else if (typeof value === 'string') {
      // Text content or base64 string
      if (value.length === 0) {
        throw new Error('Content cannot be empty');
      }
      if (value.length > 400000) {
        throw new Error('Content too large (max 400KB)');
      }
      return true;
    } else {
      throw new Error('Content must be an array or string');
    }
  }),
  body('expiration').isIn(['5min', '15min', '30min', '1hr', '6hr', '24hr']).withMessage('Invalid expiration time'),
  body('hasPassword').optional().isBoolean().withMessage('hasPassword must be a boolean'),
  body('oneTime').optional().isBoolean().withMessage('oneTime must be a boolean'),
  body('quickShare').optional().isBoolean().withMessage('quickShare must be a boolean'),
  body('quickShareSecret').optional().isString().withMessage('quickShareSecret must be a string'),
  body('contentType').optional().isIn(['text', 'binary']).withMessage('contentType must be text or binary')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    let { content, expiration, hasPassword, oneTime, quickShare, quickShareSecret, contentType = 'text' } = req.body;

    // Quick Share Mode: Override settings
    if (quickShare) {
      expiration = '5min';
      hasPassword = false;
      // Keep oneTime setting from user (don't override)
    }

    // Validate content
    if (!content || (typeof content === 'string' && content.trim().length === 0)) {
      return res.status(400).json({
        error: 'Invalid content',
        message: 'Content is required.'
      });
    }

    // Process content based on type
    let processedContent;
    let storagePath = null;
    let mimeType = 'text/plain';
    let filesize = 0;

    try {
      if (contentType === 'text' && typeof content === 'string') {
        // Text content - check if it's base64 encoded encrypted data
        try {
          // Try to decode as base64 first
          const decoded = Buffer.from(content, 'base64');
          // If it's valid base64, treat as encrypted binary data
          if (decoded.length > 0) {
            processedContent = decoded; // Store as buffer for encrypted data
            filesize = decoded.length;
            mimeType = 'application/octet-stream'; // Mark as binary for encrypted content
            contentType = 'binary'; // Override to binary since it's encrypted
          } else {
            // Empty base64, treat as plain text
            processedContent = content;
            filesize = Buffer.from(content, 'utf-8').length;
            mimeType = 'text/plain; charset=utf-8';
          }
        } catch (base64Error) {
          // Not valid base64, treat as plain text
          processedContent = content;
          filesize = Buffer.from(content, 'utf-8').length;
          mimeType = 'text/plain; charset=utf-8';
        }
      } else if (Array.isArray(content)) {
        // Binary content: raw bytes array from client
        processedContent = Buffer.from(content);
        filesize = processedContent.length;
        mimeType = 'application/octet-stream';
      } else if (typeof content === 'string') {
        // Check if this is base64 encoded binary or plain text
        try {
          // Try to decode as base64 first
          const decoded = Buffer.from(content, 'base64');
          // If it's valid base64 and looks like binary data, treat as binary
          if (decoded.length > 0 && !decoded.toString('utf-8').match(/^[\x00-\x7F]*$/)) {
            processedContent = decoded;
            filesize = processedContent.length;
            mimeType = 'application/octet-stream';
          } else {
            // Treat as plain text
            processedContent = content;
            filesize = Buffer.from(content, 'utf-8').length;
            mimeType = 'text/plain; charset=utf-8';
            contentType = 'text'; // Override content type
          }
        } catch (base64Error) {
          // Not valid base64, treat as plain text
          processedContent = content;
          filesize = Buffer.from(content, 'utf-8').length;
          mimeType = 'text/plain; charset=utf-8';
          contentType = 'text'; // Override content type
        }
      } else {
        throw new Error('Invalid content format');
      }
      
    } catch (error) {
      console.error('❌ Error processing content:', error);
      return res.status(400).json({
        error: 'Invalid content format',
        message: 'Content must be valid text or binary data.'
      });
    }

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
    const clipId = generateClipId(quickShare);

    // Handle password_hash column based on clip type
    let passwordHash = null;
    if (quickShare && quickShareSecret) {
      // Quick Share: Store the secret in password_hash column
      if (quickShareSecret.length > 60) {
        console.error('❌ Quick Share secret too long:', quickShareSecret.length);
        return res.status(400).json({
          error: 'Secret too long',
          message: 'Generated secret is too long for storage'
        });
      }
      passwordHash = quickShareSecret;
    } else if (hasPassword) {
      // Password-protected: Mark as client-encrypted
      passwordHash = 'client-encrypted';
    }

    // For larger content (>1MB), store as file; otherwise store inline
    const shouldStoreAsFile = processedContent.length > 1024 * 1024; // 1MB threshold

    try {
      if (shouldStoreAsFile) {
        // Store as file in the storage system
        const uploadId = generateUploadId();
        storagePath = path.join(STORAGE_PATH, 'files', `${uploadId}.content`);
        await fs.writeFile(storagePath, processedContent);

        // Create file metadata
        const file_metadata = {
          originalSize: processedContent.length,
          contentType: contentType,
          storedAsFile: true
        };

      await pool.query(`
          INSERT INTO clips (
            clip_id, content_type, file_path, mime_type, filesize, 
            file_metadata, expiration_time, password_hash, one_time, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          clipId, contentType, storagePath, mimeType, filesize,
          JSON.stringify(file_metadata), expirationTime, passwordHash, 
          oneTime || false, Date.now()
        ]);
      } else {
        // Store inline in database (legacy compatibility)
        await pool.query(`
          INSERT INTO clips (
            clip_id, content_type, content, mime_type, filesize,
            expiration_time, password_hash, one_time, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          clipId, contentType, processedContent, mimeType, filesize,
          expirationTime, passwordHash, oneTime || false, Date.now()
        ]);
      }
    } catch (dbError) {
      console.error('❌ Database error:', dbError.message);
      if (dbError.message.includes('password_hash')) {
        return res.status(500).json({
          error: 'Database schema issue',
          message: 'Password hash column too small for Quick Share secrets'
        });
      }
      throw dbError;
    }

    // Update statistics
    await updateStatistics('clip_created');
    
    if (quickShare) {
        await updateStatistics('quick_share_created');
    } else if (hasPassword) {
        await updateStatistics('password_protected_created');
    } else {
        await updateStatistics('normal_created');
    }
    
    if (oneTime) {
        await updateStatistics('one_time_created');
    }

    res.json({
      success: true,
      clipId: clipId,
      url: `${req.protocol}://${req.get('host')}/clip/${clipId}`,
      expiresAt: expirationTime,
      oneTime: oneTime || false,
      quickShare: quickShare || false
    });

  } catch (error) {
    console.error('❌ Error creating clip:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create clip'
    });
  }
});

// Get clip info
app.get('/api/clip/:clipId/info', [
  param('clipId').custom((value) => {
    // Support both 4-character (Quick Share) and 10-character (normal) IDs
    if (value.length !== 4 && value.length !== 10) {
      throw new Error('Clip ID must be 4 or 10 characters');
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
    const { downloadToken } = req.query; // Get download token from query params

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
      password_hash: !!clip.password_hash
    });

    // Authentication logic: All 10-digit clips need authentication (except Quick Share)
    const isQuickShare = clipId.length === 4;
    const isNormalClip = clipId.length === 10;
    
    console.log('🔍 Info endpoint logic check:', {
      isQuickShare,
      isNormalClip,
      willRequireAuth: isNormalClip && !isQuickShare
    });
    
    if (isNormalClip && !isQuickShare) {
      console.log('🔐 Normal clip detected, validating download token for clipId:', clipId);
      
      if (!downloadToken) {
        console.log('❌ No download token provided for normal clip:', clipId);
        return res.status(401).json({
          error: 'Authentication required',
          message: 'This clip requires authentication. Please provide the correct URL with secret or password.',
          requiresAuth: true,
          hasPassword: clip.password_hash !== null
        });
      }

      // Validate the download token
      const isValidToken = await validateDownloadToken(clipId, downloadToken);
      if (!isValidToken) {
        console.log('❌ Invalid download token for normal clip:', clipId);
        return res.status(403).json({
          error: 'Access denied',
          message: 'Invalid credentials for this clip. Please check your URL secret or password.',
          requiresAuth: true,
          hasPassword: clip.password_hash !== null
        });
      }

      console.log('✅ Download token validated for normal clip:', clipId);
    } else if (isQuickShare) {
      console.log('⚡ Quick Share clip - no authentication required:', clipId);
    }

    // Determine if clip has password based on ID length and password_hash content
    let hasPassword = false;
    if (clipId.length === 10) {
      // For normal clips (10-digit), check if password_hash is 'client-encrypted' (indicates password protection)
      hasPassword = clip.password_hash === 'client-encrypted';
      console.log('🔍 Clip info debug:', {
        clipId,
        contentType: clip.content_type,
        password_hash: clip.password_hash,
        hasPassword
      });
    } else {
      // For Quick Share clips (4-digit), never have passwords
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

// Get clip (no password authentication needed - content is encrypted client-side)
app.get('/api/clip/:clipId', [
  param('clipId').custom((value) => {
    // Support both 4-character (Quick Share) and 10-character (normal) IDs
    if (value.length !== 4 && value.length !== 10) {
      throw new Error('Clip ID must be 4 or 10 characters');
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
    const { downloadToken } = req.query; // Get download token from query params

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

    // Authentication logic: All 10-digit clips need authentication (except Quick Share)
    const isQuickShare = clipId.length === 4;
    const isNormalClip = clipId.length === 10;
    
    console.log('🔍 Main endpoint logic check:', {
      isQuickShare,
      isNormalClip,
      willRequireAuth: isNormalClip && !isQuickShare
    });
    
    if (isNormalClip && !isQuickShare) {
      console.log('🔐 Normal clip detected in main endpoint, validating download token for clipId:', clipId);
      
      if (!downloadToken) {
        console.log('❌ No download token provided for normal clip in main endpoint:', clipId);
        return res.status(401).json({
          error: 'Authentication required',
          message: 'This clip requires authentication. Please provide the correct URL with secret or password.',
          requiresAuth: true,
          hasPassword: clip.password_hash !== null
        });
      }

      // Validate the download token
      const isValidToken = await validateDownloadToken(clipId, downloadToken);
      if (!isValidToken) {
        console.log('❌ Invalid download token for normal clip in main endpoint:', clipId);
        return res.status(403).json({
          error: 'Access denied',
          message: 'Invalid credentials for this clip. Please check your URL secret or password.',
          requiresAuth: true,
          hasPassword: clip.password_hash !== null
        });
      }

      console.log('✅ Download token validated for normal clip in main endpoint:', clipId);
    } else if (isQuickShare) {
      console.log('⚡ Quick Share clip in main endpoint - no authentication required:', clipId);
    }

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
      // Note: One-time deletion happens in /api/file/ endpoint, not here
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
        
        // For Quick Share clips (4-digit ID), include the secret for decryption
        if (clipId.length === 4 && clip.password_hash) {
          // For Quick Share, password_hash contains the actual secret (not 'client-encrypted')
          console.log('🔑 Adding quickShareSecret for 4-digit clip:', clipId, 'secret:', clip.password_hash);
          response.quickShareSecret = clip.password_hash;
        } else {
          console.log('🔑 Not adding quickShareSecret for clip:', clipId, 'length:', clipId.length, 'password_hash:', clip.password_hash);
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
        // Text content stored as string (unencrypted)
        responseContent = clip.content; // Already a string
        contentMetadata.contentType = 'text';
      } else {
        // Binary content - check if it's a buffer or string
        if (Buffer.isBuffer(clip.content)) {
          // This could be encrypted text or binary data
          // For text clips, this is encrypted content that needs client-side decryption
          responseContent = Array.from(clip.content);
          contentMetadata.contentType = 'binary';
        } else if (typeof clip.content === 'string') {
          // String content - treat as text
          responseContent = clip.content;
          contentMetadata.contentType = 'text';
        } else {
          // Unknown format - try to convert
          responseContent = clip.content.toString();
          contentMetadata.contentType = 'text';
        }
      }
      
      // Handle one-time access for inline content - delete after loading content
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

    // Prepare response
    const response = {
      success: true,
      content: responseContent,
      contentType: contentMetadata.contentType || 'binary',
      expiresAt: clip.expiration_time,
      oneTime: clip.one_time,
      hasPassword: false // Quick Share clips never have passwords
    };

    // Add additional metadata for files
    if (clip.filesize) {
      response.filesize = clip.filesize;
    }
    if (clip.mime_type) {
      response.mimeType = clip.mime_type;
    }

    // For Quick Share clips (4-digit ID), include the secret for decryption
    if (clipId.length === 4 && clip.password_hash) {
      // For Quick Share, password_hash contains the actual secret (not 'client-encrypted')
      console.log('🔑 Adding quickShareSecret for 4-digit clip (inline):', clipId, 'secret:', clip.password_hash);
      response.quickShareSecret = clip.password_hash;
    } else if (clipId.length === 10) {
      // For normal clips, check if they have password protection
      response.hasPassword = clip.password_hash === 'client-encrypted';
    }
    
    if (clipId.length === 4) {
      console.log('🔑 Quick Share clip processing (inline):', clipId, 'password_hash:', clip.password_hash);
    }

    res.json(response);

  } catch (error) {
    console.error('❌ Error retrieving clip:', error.message);
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
    if (!authHeader || authHeader !== `Bearer ${adminToken}`) {
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
    
    if (password === adminToken) {
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
app.get('/clip/:clipId([A-Z0-9]{4}|[A-Z0-9]{10})$', (req, res) => {
  // This route matches exact 4-character (Quick Share) or 10-character (normal) alphanumeric clip IDs
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
    gracefulShutdown();
});

process.on('SIGINT', () => {
    gracefulShutdown();
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
function gracefulShutdown() {
    console.log('🛑 Graceful shutdown initiated');
    
    // Clear cleanup interval
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
    }
    
    // Close database connection pool
    pool.end()
        .then(() => {
            console.log('✅ Server shutdown complete');
            process.exit(0);
        })
        .catch((err) => {
            console.error('❌ Error closing database pool:', err.message);
            process.exit(1);
        });
    
    // Force exit after timeout
    setTimeout(() => {
        console.log('⚠️ Database pool close timeout, forcing exit...');
        process.exit(1);
    }, 10000);
}

// Initialize and start server
async function startServer() {
    try {
        console.log('🚀 Starting Qopy server with automatic database migration...');
        
        // Test database connection
        const client = await pool.connect();
        console.log('✅ Database connection established');
        
        await runDatabaseMigration(client);
        
        // Ensure storage directory exists
        await initializeStorage();

        client.release();
        
        app.listen(PORT, () => {
            console.log(`🚀 Qopy server running on port ${PORT}`);
            console.log(`📊 Admin dashboard: ${process.env.NODE_ENV === 'production' ? 'https://' : 'http://localhost:'}${PORT}/admin`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}

// Comprehensive database migration function
async function runDatabaseMigration(client) {
    console.log('🔄 Running automatic database migration...');
    
    try {
        // 1. CREATE STATISTICS TABLE
        console.log('📊 Creating statistics table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS statistics (
                id SERIAL PRIMARY KEY,
                total_clips BIGINT DEFAULT 0,
                total_accesses BIGINT DEFAULT 0,
                quick_share_clips BIGINT DEFAULT 0,
                password_protected_clips BIGINT DEFAULT 0,
                one_time_clips BIGINT DEFAULT 0,
                normal_clips BIGINT DEFAULT 0,
                last_updated BIGINT DEFAULT 0
            )
        `);

        // 2. CREATE CLIPS TABLE
        console.log('📋 Creating clips table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS clips (
                id SERIAL PRIMARY KEY,
                clip_id VARCHAR(10) UNIQUE NOT NULL,
                password_hash VARCHAR(255),
                one_time BOOLEAN DEFAULT false,
                quick_share BOOLEAN DEFAULT false,
                expiration_time BIGINT NOT NULL,
                access_count INTEGER DEFAULT 0,
                created_at BIGINT NOT NULL,
                accessed_at BIGINT,
                is_expired BOOLEAN DEFAULT false
            )
        `);

        // 3. EXTEND CLIPS TABLE FOR FILE SUPPORT
        console.log('🗂️ Extending clips table for file support...');
        const clipExtensions = [
            'ALTER TABLE clips ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT \'text\'',
            'ALTER TABLE clips ADD COLUMN IF NOT EXISTS file_metadata JSONB',
            'ALTER TABLE clips ADD COLUMN IF NOT EXISTS file_path VARCHAR(500)',
            'ALTER TABLE clips ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255)',
            'ALTER TABLE clips ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100)',
            'ALTER TABLE clips ADD COLUMN IF NOT EXISTS filesize BIGINT',
            'ALTER TABLE clips ADD COLUMN IF NOT EXISTS is_file BOOLEAN DEFAULT false',
            'ALTER TABLE clips ADD COLUMN IF NOT EXISTS content BYTEA'
        ];

        for (const query of clipExtensions) {
            try {
                await client.query(query);
            } catch (error) {
                console.warn(`⚠️ Column extension warning: ${error.message}`);
            }
        }

        // 4. CREATE UPLOAD_SESSIONS TABLE
        console.log('📤 Creating upload_sessions table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS upload_sessions (
                id SERIAL PRIMARY KEY,
                upload_id VARCHAR(50) UNIQUE NOT NULL,
                filename VARCHAR(255) NOT NULL,
                original_filename VARCHAR(255) NOT NULL,
                filesize BIGINT NOT NULL,
                mime_type VARCHAR(100) NOT NULL,
                chunk_size INTEGER NOT NULL DEFAULT 5242880,
                total_chunks INTEGER NOT NULL,
                uploaded_chunks INTEGER DEFAULT 0,
                checksums TEXT[],
                status VARCHAR(20) DEFAULT 'uploading',
                expiration_time BIGINT NOT NULL,
                has_password BOOLEAN DEFAULT false,
                one_time BOOLEAN DEFAULT false,
                quick_share BOOLEAN DEFAULT false,
                is_text_content BOOLEAN DEFAULT false,
                client_ip VARCHAR(45),
                created_at BIGINT NOT NULL,
                last_activity BIGINT NOT NULL,
                completed_at BIGINT
            )
        `);

        // 5. CREATE FILE_CHUNKS TABLE
        console.log('🧩 Creating file_chunks table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS file_chunks (
                id SERIAL PRIMARY KEY,
                upload_id VARCHAR(50) NOT NULL,
                chunk_number INTEGER NOT NULL,
                chunk_size INTEGER NOT NULL,
                checksum VARCHAR(64) NOT NULL,
                storage_path VARCHAR(500) NOT NULL,
                created_at BIGINT NOT NULL,
                UNIQUE(upload_id, chunk_number)
            )
        `);

        // Add foreign key constraint if it doesn't exist
        try {
            await client.query(`
                ALTER TABLE file_chunks 
                ADD CONSTRAINT fk_file_chunks_upload_id 
                FOREIGN KEY (upload_id) REFERENCES upload_sessions(upload_id) ON DELETE CASCADE
            `);
        } catch (error) {
            if (!error.message.includes('already exists')) {
                console.warn(`⚠️ Foreign key warning: ${error.message}`);
            }
        }

        // 6. CREATE UPLOAD_STATISTICS TABLE
        console.log('📈 Creating upload_statistics table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS upload_statistics (
                id SERIAL PRIMARY KEY,
                date DATE NOT NULL,
                total_uploads INTEGER DEFAULT 0,
                total_file_size BIGINT DEFAULT 0,
                completed_uploads INTEGER DEFAULT 0,
                failed_uploads INTEGER DEFAULT 0,
                text_clips INTEGER DEFAULT 0,
                file_clips INTEGER DEFAULT 0,
                avg_upload_time INTEGER DEFAULT 0,
                UNIQUE(date)
            )
        `);

        // 7. CREATE ALL NECESSARY INDEXES
        console.log('🔗 Creating database indexes...');
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_clips_clip_id ON clips(clip_id)',
            'CREATE INDEX IF NOT EXISTS idx_clips_expiration ON clips(expiration_time)',
            'CREATE INDEX IF NOT EXISTS idx_clips_content_type ON clips(content_type)',
            'CREATE INDEX IF NOT EXISTS idx_clips_file_path ON clips(file_path)',
            'CREATE INDEX IF NOT EXISTS idx_clips_is_expired ON clips(is_expired)',
            'CREATE INDEX IF NOT EXISTS idx_upload_sessions_upload_id ON upload_sessions(upload_id)',
            'CREATE INDEX IF NOT EXISTS idx_upload_sessions_status_expiration ON upload_sessions(status, expiration_time)',
            'CREATE INDEX IF NOT EXISTS idx_upload_sessions_created_at ON upload_sessions(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_file_chunks_upload_chunk ON file_chunks(upload_id, chunk_number)',
            'CREATE INDEX IF NOT EXISTS idx_file_chunks_created_at ON file_chunks(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_upload_statistics_date ON upload_statistics(date)',
            'CREATE INDEX IF NOT EXISTS idx_statistics_id ON statistics(id)'
        ];

        for (const indexQuery of indexes) {
            try {
                await client.query(indexQuery);
            } catch (error) {
                console.warn(`⚠️ Index creation warning: ${error.message}`);
            }
        }

        // 8. CREATE DATABASE FUNCTIONS
        console.log('⚙️ Creating database functions...');
        
        // Cleanup function for expired uploads
        await client.query(`
            CREATE OR REPLACE FUNCTION cleanup_expired_uploads() RETURNS void AS $$
            BEGIN
                DELETE FROM upload_sessions WHERE expiration_time < EXTRACT(EPOCH FROM NOW()) * 1000;
                DELETE FROM file_chunks WHERE upload_id NOT IN (SELECT upload_id FROM upload_sessions);
            END;
            $$ LANGUAGE plpgsql
        `);

        // Statistics trigger function
        await client.query(`
            CREATE OR REPLACE FUNCTION update_upload_stats() RETURNS TRIGGER AS $$
            BEGIN
                IF TG_OP = 'INSERT' THEN
                    INSERT INTO upload_statistics (date, total_uploads, total_file_size) 
                    VALUES (CURRENT_DATE, 1, NEW.filesize)
                    ON CONFLICT (date) 
                    DO UPDATE SET 
                        total_uploads = upload_statistics.total_uploads + 1,
                        total_file_size = upload_statistics.total_file_size + NEW.filesize;
                    RETURN NEW;
                END IF;
                
                IF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status != 'completed' THEN
                    INSERT INTO upload_statistics (date, completed_uploads) 
                    VALUES (CURRENT_DATE, 1)
                    ON CONFLICT (date) 
                    DO UPDATE SET completed_uploads = upload_statistics.completed_uploads + 1;
                    RETURN NEW;
                END IF;
                
                RETURN NULL;
            END;
            $$ LANGUAGE plpgsql
        `);

        // 9. CREATE TRIGGERS
        console.log('🔄 Creating database triggers...');
        await client.query(`DROP TRIGGER IF EXISTS trigger_upload_stats ON upload_sessions`);
        await client.query(`
            CREATE TRIGGER trigger_upload_stats
                AFTER INSERT OR UPDATE ON upload_sessions
                FOR EACH ROW EXECUTE FUNCTION update_upload_stats()
        `);

        // 10. DATA MIGRATIONS AND CLEANUP
        console.log('🧹 Running data migrations...');
        
        // Update existing expired clips
        await client.query(`
            UPDATE clips 
            SET is_expired = true 
            WHERE expiration_time < $1 AND is_expired = false
        `, [Date.now()]);
        
        // Fix content_type for existing files
        await client.query(`
            UPDATE clips 
            SET content_type = 'file' 
            WHERE file_path IS NOT NULL AND content_type = 'text'
        `);

        // Remove unused columns safely
        try {
            const unusedColumnsCheck = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'clips' AND column_name IN ('client_ip', 'last_accessed', 'upload_id', 'max_accesses')
            `);
            
            const existingUnusedColumns = unusedColumnsCheck.rows.map(row => row.column_name);
            
            for (const columnName of existingUnusedColumns) {
                if (columnName === 'upload_id') {
                    try {
                        await client.query(`DROP INDEX IF EXISTS idx_clips_upload_id`);
                    } catch (indexError) {
                        console.warn(`⚠️ Index removal warning: ${indexError.message}`);
                    }
                }
                
                await client.query(`ALTER TABLE clips DROP COLUMN ${columnName}`);
                console.log(`🗑️ Removed unused column: ${columnName}`);
            }
        } catch (dropError) {
            console.warn(`⚠️ Column cleanup warning: ${dropError.message}`);
        }

        // 11. INITIALIZE DATA
        console.log('📊 Initializing default data...');
        
        // Initialize statistics if empty
        const statsCheck = await client.query('SELECT COUNT(*) as count FROM statistics');
        if (parseInt(statsCheck.rows[0].count) === 0) {
            await client.query(`
                INSERT INTO statistics (total_clips, total_accesses, quick_share_clips, 
                                      password_protected_clips, one_time_clips, normal_clips, last_updated)
                VALUES (0, 0, 0, 0, 0, 0, $1)
            `, [Date.now()]);
            console.log('📊 Statistics table initialized');
        }

        // Initialize upload statistics for today
        await client.query(`
            INSERT INTO upload_statistics (date, total_uploads, total_file_size, completed_uploads, failed_uploads, text_clips, file_clips, avg_upload_time)
            VALUES (CURRENT_DATE, 0, 0, 0, 0, 0, 0, 0)
            ON CONFLICT (date) DO NOTHING
        `);

        // 12. SCHEMA VALIDATION
        console.log('✅ Validating database schema...');
        
        // Check that all required tables exist
        const requiredTables = ['clips', 'statistics', 'upload_sessions', 'file_chunks', 'upload_statistics'];
        const tableCheck = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = ANY($1)
        `, [requiredTables]);
        
        const existingTables = tableCheck.rows.map(row => row.table_name);
        const missingTables = requiredTables.filter(table => !existingTables.includes(table));
        
        if (missingTables.length > 0) {
            throw new Error(`Missing required tables: ${missingTables.join(', ')}`);
        }

        // Check critical columns in clips table
        const criticalColumns = ['clip_id', 'content_type', 'file_path', 'filesize', 'is_expired'];
        const columnCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'clips' AND column_name = ANY($1)
        `, [criticalColumns]);
        
        const existingColumns = columnCheck.rows.map(row => row.column_name);
        const missingColumns = criticalColumns.filter(col => !existingColumns.includes(col));
        
        if (missingColumns.length > 0) {
            throw new Error(`Missing critical columns in clips table: ${missingColumns.join(', ')}`);
        }

        console.log('✅ Database migration completed successfully!');
        console.log(`📊 Tables: ${existingTables.join(', ')}`);
        console.log(`🗂️ Clips columns: ${existingColumns.length} columns validated`);

    } catch (migrationError) {
        console.error('❌ Database migration failed:', migrationError.message);
        throw migrationError;
    }
}

startServer(); 