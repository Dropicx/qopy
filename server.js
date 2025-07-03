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

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 Qopy Server (Minimal PostgreSQL) starting...');
console.log(`📋 Port: ${PORT}`);
console.log(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);

// PostgreSQL Configuration
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required for PostgreSQL');
  console.error('   Please add PostgreSQL plugin in Railway dashboard');
  process.exit(1);
}

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Test database connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
});

// Trust proxy for Railway deployment
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
} else {
  app.set('trust proxy', true);
}

// IMMEDIATE HEALTH CHECK (no database queries)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: 'minimal-1.0.0'
  });
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
      scriptSrc: ["'self'", "'unsafe-inline'"],
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
    if (process.env.NODE_ENV !== 'production') {
      allowedOrigins.push(
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:8080',
        'http://127.0.0.1:8080'
      );
    }
    
    // Production origins
    if (process.env.NODE_ENV === 'production') {
      allowedOrigins.push(
        'https://qopy.app',
        'https://www.qopy.app',
        'https://qopy-production.up.railway.app',
        'https://qopy-staging.up.railway.app'
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

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests',
    message: 'Please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Serve static files (before API routes)
app.use(express.static('public'));

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

// Cleanup expired clips
async function cleanupExpiredClips() {
  try {
    const result = await pool.query(
      'DELETE FROM clips WHERE expiration_time < $1',
      [Date.now()]
    );
    if (result.rowCount > 0) {
      console.log(`🧹 Cleaned up ${result.rowCount} expired clips`);
    }
  } catch (error) {
    console.error('❌ Error cleaning up expired clips:', error.message);
  }
}

// Create share
app.post('/api/share', [
  body('content').isLength({ min: 1, max: 100000 }).withMessage('Content must be between 1 and 100000 characters'),
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

    const { content, expiration, password, oneTime } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

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

    // Insert clip into database (with fallback for missing columns)
    try {
      await pool.query(`
        INSERT INTO clips (clip_id, content, expiration_time, password_hash, one_time, created_at, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [clipId, content, expirationTime, password || null, oneTime || false, Date.now(), clientIP, userAgent]);
    } catch (error) {
      if (error.message.includes('ip_address')) {
        // Fallback: insert without ip_address and user_agent columns
        await pool.query(`
          INSERT INTO clips (clip_id, content, expiration_time, password_hash, one_time, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [clipId, content, expirationTime, password || null, oneTime || false, Date.now()]);
      } else {
        throw error;
      }
    }

    console.log(`📋 Created clip: ${clipId}`);

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
      console.log(`🗑️ One-time clip accessed and deleted: ${clipId}`);
    }

    console.log(`📋 Retrieved clip: ${clipId}`);

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

    // Check password
    if (clip.password_hash !== password) {
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
      console.log(`🗑️ One-time clip accessed and deleted: ${clipId}`);
    }

    console.log(`📋 Retrieved password-protected clip: ${clipId}`);

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

// Route for direct clip access
app.get('/clip/:clipId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve static files
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
  pool.end((err) => {
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
    const server = app.listen(PORT, () => {
      console.log(`🚀 Qopy server running on port ${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗄️ Database: PostgreSQL (Minimal Mode)`);
      console.log(`📊 Database connection pool initialized`);
      console.log(`✅ Health check available at /health`);
      
      // Database initialization is handled by db-init.js script
      console.log('✅ Database ready for connections');
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
    process.exit(1);
  }
}

startServer(); 