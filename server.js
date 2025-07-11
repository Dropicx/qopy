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
const QRCode = require('qrcode');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const xss = require('xss');
const sanitizeHtml = require('sanitize-html');

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
    
    const allowedOrigins = [];
    
    // Development origins
    /*if (process.env.NODE_ENV !== 'production') {
      allowedOrigins.push(
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:8080',
        'http://127.0.0.1:8080'
      );
    }*/
    
    // Production origins
    if (process.env.NODE_ENV === 'production') {
      allowedOrigins.push(
        'https://qopy.app',
        //'https://www.qopy.app',
        //'https://qopy-production.up.railway.app',
        //'https://qopy-staging.up.railway.app'
      );
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
  const userAgent = req.get('User-Agent') || 'Unknown';
  const path = req.path;
  
  // Log suspicious patterns
  if (req.path === '/api/share' && req.method === 'POST') {

  }
  
  // Log rate limit hits
  res.on('finish', () => {
    if (res.statusCode === 429) {
      console.warn(`🚫 Rate limit hit by ${clientIP} on ${path} - ${userAgent.substring(0, 50)}`);
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
function generateClipId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Password hashing functions
async function hashPassword(password) {
  if (!password) return null;
  const saltRounds = 12; // High security level
  try {
    return await bcrypt.hash(password, saltRounds);
  } catch (error) {
    console.error('❌ Error hashing password:', error.message);
    throw new Error('Failed to hash password');
  }
}

async function verifyPassword(password, hash) {
  if (!password || !hash) return false;
  
  // Check if hash is already bcrypt format
  if (hash.startsWith('$2b$')) {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      console.error('❌ Error verifying bcrypt password:', error.message);
      return false;
    }
  } else {
    // Legacy plaintext comparison (for migration period)
    console.warn('⚠️ Using legacy plaintext password comparison for migration');
    return password === hash;
  }
}

// Cleanup expired clips
async function cleanupExpiredClips() {
  try {
    const result = await pool.query(
      'DELETE FROM clips WHERE expiration_time < $1',
      [Date.now()]
    );
    if (result.rowCount > 0) {
  
    }
  } catch (error) {
    console.error('❌ Error cleaning up expired clips:', error.message);
  }
}

// Content-Sanitization-Funktion
function sanitizeContent(content) {
  // Für alle Inhalte: HTML-Tags entfernen und als reinen Text behandeln
  // Das ist die sicherste Option - Code wird nur als Text angezeigt
  return xss(content, {
    whiteList: {}, // Keine HTML-Tags erlauben
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style', 'iframe', 'object', 'embed'],
    // Erlaubt nur sichere Zeichen
    allowCommentTag: false
  });
}

// Create share
app.post('/api/share', [
  body('content').isLength({ min: 1, max: 400000 }).withMessage('Content must be between 1 and 400000 characters'),
  body('expiration').isIn(['5min', '15min', '30min', '1hr', '6hr', '24hr']).withMessage('Invalid expiration time'),
  body('password').optional().isLength({ min: 1, max: 128 }).withMessage('Password must be between 1 and 128 characters'),
  body('oneTime').optional().isBoolean().withMessage('oneTime must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    let { content, expiration, password, oneTime } = req.body;

    // Content-Sanitization
    content = sanitizeContent(content);
    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        error: 'Invalid content',
        message: 'Content is empty or invalid after sanitization.'
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
    const clipId = generateClipId();

    // Hash password if provided
    let passwordHash = null;
    if (password) {
      // Ensure password is not already hashed (security check)
      if (password.startsWith('$2b$')) {
        return res.status(400).json({
          error: 'Invalid password format',
          message: 'Password cannot be a hash'
        });
      }
      passwordHash = await hashPassword(password);
    }

    // Insert clip into database (privacy-first: no IP/user-agent tracking)
    await pool.query(`
      INSERT INTO clips (clip_id, content, expiration_time, password_hash, one_time, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [clipId, content, expirationTime, passwordHash, oneTime || false, Date.now()]);



    res.json({
      success: true,
      clipId: clipId,
      url: `${req.protocol}://${req.get('host')}/clip/${clipId}`,
      expiresAt: expirationTime,
      oneTime: oneTime || false
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
  param('clipId').isLength({ min: 6, max: 6 }).withMessage('Clip ID must be 6 characters')
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
      'SELECT clip_id, expiration_time, one_time, password_hash IS NOT NULL as has_password FROM clips WHERE clip_id = $1 AND is_expired = false',
      [clipId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Clip not found',
        message: 'The requested clip does not exist or has expired'
      });
    }

    const clip = result.rows[0];

    res.json({
      success: true,
      clipId: clip.clip_id,
      expiresAt: clip.expiration_time,
      oneTime: clip.one_time,
      hasPassword: clip.has_password
    });

  } catch (error) {
    console.error('❌ Error getting clip info:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get clip info'
    });
  }
});

// Get clip (without password)
app.get('/api/clip/:clipId', [
  param('clipId').isLength({ min: 6, max: 6 }).withMessage('Clip ID must be 6 characters')
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

    // Check if password is required
    if (clip.password_hash) {
      return res.status(401).json({
        error: 'Password required',
        message: 'This clip is password protected'
      });
    }

    // Update access count and timestamp
    await pool.query(`
      UPDATE clips 
      SET access_count = access_count + 1, accessed_at = $1 
      WHERE clip_id = $2
    `, [Date.now(), clipId]);

    // Handle one-time access
    if (clip.one_time) {
      await pool.query(
        'UPDATE clips SET is_expired = true WHERE clip_id = $1',
        [clipId]
      );
    }

    res.json({
      success: true,
      content: clip.content,
      expiresAt: clip.expiration_time,
      oneTime: clip.one_time,
      hasPassword: false
    });

  } catch (error) {
    console.error('❌ Error retrieving clip:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve clip'
    });
  }
});

// Get clip with password
app.post('/api/clip/:clipId', [
  param('clipId').isLength({ min: 6, max: 6 }).withMessage('Clip ID must be 6 characters'),
  body('password').isLength({ min: 1, max: 100 }).withMessage('Password must be between 1 and 100 characters')
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
    const { password } = req.body;

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

    // Verify password
    const isPasswordValid = await verifyPassword(password, clip.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid password',
        message: 'The provided password is incorrect'
      });
    }

    // Update access count and timestamp
    await pool.query(`
      UPDATE clips 
      SET access_count = access_count + 1, accessed_at = $1 
      WHERE clip_id = $2
    `, [Date.now(), clipId]);

    // Handle one-time access
    if (clip.one_time) {
      await pool.query(
        'UPDATE clips SET is_expired = true WHERE clip_id = $1',
        [clipId]
      );
    }

    res.json({
      success: true,
      content: clip.content,
      expiresAt: clip.expiration_time,
      oneTime: clip.one_time,
      hasPassword: true
    });

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
    // Get total clips
    const totalResult = await pool.query('SELECT COUNT(*) as count FROM clips');
    const totalClips = parseInt(totalResult.rows[0].count);

    // Get active clips
    const activeResult = await pool.query('SELECT COUNT(*) as count FROM clips WHERE is_expired = false');
    const activeClips = parseInt(activeResult.rows[0].count);

    // Get expired clips
    const expiredResult = await pool.query('SELECT COUNT(*) as count FROM clips WHERE is_expired = true');
    const expiredClips = parseInt(expiredResult.rows[0].count);

    // Get total accesses
    const accessResult = await pool.query('SELECT COALESCE(SUM(access_count), 0) as total FROM clips');
    const totalAccesses = parseInt(accessResult.rows[0].total);

    // Get password protected clips
    const passwordResult = await pool.query('SELECT COUNT(*) as count FROM clips WHERE password_hash IS NOT NULL');
    const passwordClips = parseInt(passwordResult.rows[0].count);

    // Get one-time clips
    const oneTimeResult = await pool.query('SELECT COUNT(*) as count FROM clips WHERE one_time = true');
    const oneTimeClips = parseInt(oneTimeResult.rows[0].count);

    res.json({
      totalClips,
      activeClips,
      expiredClips,
      totalAccesses,
      passwordClips,
      oneTimeClips
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
      uptime: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
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
app.get('/clip/:clipId([A-Z0-9]{6})$', (req, res) => {
  // This route only matches exact 6-character alphanumeric clip IDs (with $ anchor)
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

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  gracefulShutdown();
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  gracefulShutdown();
});

function gracefulShutdown() {
  console.log('🛑 Starting graceful shutdown sequence');
  
  // Clear intervals
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    console.log('🧹 Cleanup interval cleared');
  }
  
  console.log('🔄 Closing database connection pool...');
  
  // Add timeout for database pool closure
  const poolCloseTimeout = setTimeout(() => {
    console.log('⚠️ Database pool close timeout, forcing exit...');
    process.exit(0);
  }, 10000); // 10 second timeout
  
  pool.end((err) => {
    clearTimeout(poolCloseTimeout);
    if (err) {
      console.error('❌ Error closing database pool:', err.message);
    } else {
      console.log('✅ Database connection pool closed');
    }
    console.log('🔌 Server closed');
    process.exit(0);
  });
}

// Initialize and start server
async function startServer() {
  try {
    // Test database connection before starting server
    const client = await pool.connect();
    await client.query('SELECT NOW() as current_time');
    client.release();
    
    const server = app.listen(PORT, () => {
      console.log(`🚀 Qopy server running on port ${PORT}`);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
        process.exit(1);
      } else {
        console.error('❌ Server error:', error);
      }
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
}

startServer(); 