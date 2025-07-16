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

const app = express();
const PORT = process.env.PORT || 8080;

console.log('🚀 Qopy Server starting...');

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
                'https://qopy-staging.up.railway.app'
            );
            
            // Allow any Railway.app subdomain for flexibility
                    if (origin.includes('.railway.app')) {
            return callback(null, true);
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


// Cleanup expired clips
async function cleanupExpiredClips() {
  try {
    // Delete expired clips
    const result = await pool.query(
      'DELETE FROM clips WHERE expiration_time < $1',
      [Date.now()]
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
    
    if (result.rowCount > 0) {
      console.log(`🧹 Cleaned up ${result.rowCount} expired clips`);
    }
  } catch (error) {
    console.error('❌ Error cleaning up expired clips:', error.message);
  }
}

// Content-Sanitization-Funktion


// Create share
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
      // Old format: base64 string (for backward compatibility)
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
  body('quickShareSecret').optional().isString().withMessage('quickShareSecret must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    let { content, expiration, hasPassword, oneTime, quickShare, quickShareSecret } = req.body;

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

    // Convert content to binary for storage
    let binaryContent;
    try {
      if (Array.isArray(content)) {
        // New format: raw bytes array from client
        binaryContent = Buffer.from(content);

      } else if (typeof content === 'string') {
        // Old format: base64 string (for backward compatibility)
        binaryContent = Buffer.from(content, 'base64');

      } else {
        throw new Error('Invalid content format');
      }
      
    } catch (error) {
      console.error('❌ Error converting content to binary:', error);
      return res.status(400).json({
        error: 'Invalid content format',
        message: 'Content must be valid binary data.'
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
      // Ensure the secret fits in the column (max 60 chars for bcrypt)
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
    // Normal clips without password: passwordHash remains null

    // Insert clip into database (privacy-first: no IP/user-agent tracking)
    // Store binary data directly as BYTEA
    
    try {
      await pool.query(`
        INSERT INTO clips (clip_id, content, expiration_time, password_hash, one_time, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [clipId, binaryContent, expirationTime, passwordHash, oneTime || false, Date.now()]);
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

    const result = await pool.query(
      'SELECT clip_id, expiration_time, one_time, password_hash FROM clips WHERE clip_id = $1 AND is_expired = false',
      [clipId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Clip not found',
        message: 'The requested clip does not exist or has expired'
      });
    }

    const clip = result.rows[0];

    // Determine if clip has password based on ID length and password_hash content
    let hasPassword = false;
    if (clipId.length === 10) {
      // For normal clips (10-digit), check if password_hash exists and is not 'client-encrypted'
      hasPassword = clip.password_hash !== null && clip.password_hash !== 'client-encrypted';
    } else {
      // For Quick Share clips (4-digit), never have passwords
      hasPassword = false;
    }

    res.json({
      success: true,
      clipId: clip.clip_id,
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

    // Update access count and timestamp
    await pool.query(`
      UPDATE clips 
      SET access_count = access_count + 1, accessed_at = $1 
      WHERE clip_id = $2
    `, [Date.now(), clipId]);
    
    // Update statistics
    await updateStatistics('clip_accessed');

    // Handle one-time access - immediately delete from database
    if (clip.one_time) {
      await pool.query(
        'DELETE FROM clips WHERE clip_id = $1',
        [clipId]
      );
    }

    // Convert binary content back to array for response
    const contentArray = Array.from(clip.content);

    // Prepare response
    const response = {
      success: true,
      content: contentArray,
      expiresAt: clip.expiration_time,
      oneTime: clip.one_time,
      hasPassword: false // Quick Share clips never have passwords
    };

    // For Quick Share clips (4-digit ID), include the secret for decryption
    if (clipId.length === 4 && clip.password_hash && clip.password_hash !== 'client-encrypted') {
      response.quickShareSecret = clip.password_hash;
    } else if (clipId.length === 10) {
      // For normal clips, check if they have password protection
      response.hasPassword = clip.password_hash !== null && clip.password_hash !== 'client-encrypted';
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
const cleanupInterval = setInterval(cleanupExpiredClips, 5 * 60 * 1000); // Every 5 minutes

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
        // Test database connection
        const client = await pool.connect();
        await client.query('SELECT NOW() as current_time');
        
        // Create statistics table if it doesn't exist
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
        
        // Initialize statistics if table is empty
        const statsCheck = await client.query('SELECT COUNT(*) as count FROM statistics');
        if (parseInt(statsCheck.rows[0].count) === 0) {
            await client.query(`
                INSERT INTO statistics (total_clips, total_accesses, quick_share_clips, 
                                      password_protected_clips, one_time_clips, normal_clips, last_updated)
                VALUES (0, 0, 0, 0, 0, 0, $1)
            `, [Date.now()]);
            console.log('📊 Statistics table initialized');
        }
        
        // Run database migration for clip_id column length
        try {
            // Check if clips table exists first
            const tableExists = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'clips'
                );
            `);
            
            if (!tableExists.rows[0].exists) {
                // Table doesn't exist, skip migration
            } else {
                const currentDef = await client.query(`
                    SELECT column_name, data_type, character_maximum_length 
                    FROM information_schema.columns 
                    WHERE table_name = 'clips' AND column_name = 'clip_id'
                `);
                
                if (currentDef.rows.length > 0) {
                    const currentLength = currentDef.rows[0].character_maximum_length;
                    
                    if (currentLength < 10) {
                        await client.query('ALTER TABLE clips ALTER COLUMN clip_id TYPE VARCHAR(10)');
                        
                        // Verify migration
                        const newDef = await client.query(`
                            SELECT column_name, data_type, character_maximum_length 
                            FROM information_schema.columns 
                            WHERE table_name = 'clips' AND column_name = 'clip_id'
                        `);
                        
                        const newLength = newDef.rows[0].character_maximum_length;
                        
                        if (newLength >= 10) {
                            // Add comment (ignore errors)
                            try {
                                await client.query(`
                                    COMMENT ON COLUMN clips.clip_id IS 'Clip ID: 4 characters for Quick Share, 10 characters for normal clips'
                                `);
                            } catch (commentError) {
                                // Comment addition failed, but migration succeeded
                            }
                        } else {
                            console.error('❌ Migration failed - column length not updated');
                        }
                    }
                }
            }
        } catch (migrationError) {
            console.error('❌ Migration error:', migrationError.message);
        }
        
        client.release();
        
        app.listen(PORT, () => {
            console.log(`🚀 Qopy server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}

startServer(); 