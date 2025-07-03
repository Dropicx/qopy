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

console.log('🚀 Qopy Server (PostgreSQL Simple) starting...');
console.log(`📋 Port: ${PORT}`);
console.log(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`📋 Railway: ${process.env.RAILWAY_ENVIRONMENT || 'local'}`);

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
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

// Trust proxy for Railway deployment
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
} else {
  app.set('trust proxy', true);
}

// EARLY HEALTH CHECK (before any complex middleware)
app.get('/api/health', async (req, res) => {
  console.log('🩺 Health check requested - uptime:', process.uptime());
  
  const response = {
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    railway: !!process.env.RAILWAY_ENVIRONMENT,
    version: 'postgres-simple-1.0.0',
    memory: process.memoryUsage(),
    pid: process.pid,
    database: 'PostgreSQL'
  };

  try {
    // Test database connection
    const client = await pool.connect();
    
    // Check if tables exist
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'clips'
      );
    `);
    
    if (tableCheck.rows[0].exists) {
      const dbResult = await client.query('SELECT COUNT(*) as total_clips FROM clips');
      const activeResult = await client.query('SELECT COUNT(*) as active_clips FROM clips WHERE is_expired = false');
      response.totalClips = parseInt(dbResult.rows[0].total_clips);
      response.activeClips = parseInt(activeResult.rows[0].active_clips);
    } else {
      response.note = 'Database tables not yet initialized';
    }
    
    client.release();
    console.log('🩺 Health check response sent');
    res.status(200).json(response);
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    response.status = 'WARNING';
    response.error = 'Database connection issue';
    response.message = error.message;
    res.status(200).json(response);
  }
});

// Anti-idle endpoint
app.get('/api/ping', (req, res) => {
  console.log('🏓 Ping received');
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

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.url} - ${req.headers['user-agent']?.substring(0, 50) || 'Unknown'}`);
  next();
});

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
app.use(express.static('public', {
  setHeaders: (res, path) => {
    console.log(`📁 Serving static file: ${path}`);
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (path.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    }
  }
}));

// Debug route to test static file serving
app.get('/test-static', (req, res) => {
  res.json({
    message: 'Static file middleware is working',
    publicPath: path.join(__dirname, 'public'),
    files: ['styles.css', 'script.js', 'index.html']
  });
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
    const now = Date.now();
    const result = await pool.query(
      'UPDATE clips SET is_expired = true WHERE expiration_time <= $1 AND is_expired = false',
      [now]
    );
    
    if (result.rowCount > 0) {
      console.log(`🧹 Cleaned up ${result.rowCount} expired clips`);
    }
  } catch (error) {
    console.error('❌ Error cleaning up expired clips:', error.message);
  }
}

// API Routes

// Create clip
app.post('/api/clip', [
  body('content').isLength({ min: 1, max: 100000 }).withMessage('Content must be between 1 and 100,000 characters'),
  body('expiration').isIn(['5min', '15min', '30min', '1hr', '6hr', '24hr']).withMessage('Invalid expiration time'),
  body('oneTime').optional().isBoolean().withMessage('oneTime must be a boolean'),
  body('password').optional().isLength({ min: 1, max: 100 }).withMessage('Password must be between 1 and 100 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { content, expiration, oneTime = false, password } = req.body;
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
    const now = Date.now();

    // Store clip in database
    await pool.query(`
      INSERT INTO clips (
        clip_id, content, password_hash, expiration_time, created_at,
        one_time, is_expired, created_by_ip, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      clipId,
      content,
      password || null,
      expirationTime,
      now,
      oneTime,
      false,
      clientIP,
      userAgent
    ]);

    // Generate QR code
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? (process.env.DOMAIN || 'https://qopy.app')
      : `http://localhost:${PORT}`;
    
    const clipUrl = `${baseUrl}/clip/${clipId}`;
    const qrCode = await QRCode.toDataURL(clipUrl);

    console.log(`📋 Created clip: ${clipId} (${expiration})`);

    res.json({
      success: true,
      clipId,
      url: clipUrl,
      qrCode,
      expiresAt: expirationTime,
      oneTime
    });

  } catch (error) {
    console.error('❌ Error creating clip:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create clip'
    });
  }
});

// Admin authentication middleware
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!process.env.ADMIN_TOKEN) {
    return res.status(503).json({
      error: 'Admin dashboard disabled',
      message: 'Admin token not configured'
    });
  }
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Bearer token required'
    });
  }
  
  const token = authHeader.substring(7);
  
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({
      error: 'Access denied',
      message: 'Invalid admin token'
    });
  }
  
  next();
}

// Admin dashboard
app.get('/api/admin/dashboard', requireAdminAuth, async (req, res) => {
  try {
    // Get database statistics
    const statsResult = await pool.query('SELECT COUNT(*) as total_clips FROM clips');
    const activeResult = await pool.query('SELECT COUNT(*) as active_clips FROM clips WHERE is_expired = false');
    const expiredResult = await pool.query('SELECT COUNT(*) as expired_clips FROM clips WHERE is_expired = true');
    const recentResult = await pool.query(`
      SELECT clip_id, created_at, access_count, one_time, is_expired
      FROM clips 
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    res.json({
      success: true,
      stats: {
        totalClips: parseInt(statsResult.rows[0].total_clips),
        activeClips: parseInt(activeResult.rows[0].active_clips),
        expiredClips: parseInt(expiredResult.rows[0].expired_clips),
        blockedIPs: 0, // Simple mode - no spam filtering
        spamStats: { totalAnalyzed: 0, blocked: 0, suspicious: 0 }
      },
      recentClips: recentResult.rows.map(clip => ({
        ...clip,
        created_at: new Date(clip.created_at).toISOString()
      }))
    });

  } catch (error) {
    console.error('❌ Error getting admin dashboard:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get admin dashboard'
    });
  }
});

// Get clip
app.get('/api/clip/:clipId', [
  param('clipId').isLength({ min: 6, max: 6 }).withMessage('Clip ID must be 6 characters'),
  body('password').optional().isLength({ min: 1, max: 100 }).withMessage('Password must be between 1 and 100 characters')
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
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

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

    // Check password if required
    if (clip.password_hash && clip.password_hash !== password) {
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

    // Log access
    await pool.query(`
      INSERT INTO access_logs (clip_id, ip_address, user_agent, accessed_at, success)
      VALUES ($1, $2, $3, $4, $5)
    `, [clipId, clientIP, userAgent, Date.now(), true]);

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
      hasPassword: !!clip.password_hash
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

// Admin route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
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

// Memory monitoring
function monitorMemory() {
  const memUsage = process.memoryUsage();
  const memUsageMB = {
    rss: Math.round(memUsage.rss / 1024 / 1024),
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
    external: Math.round(memUsage.external / 1024 / 1024)
  };
  
  console.log('💾 Memory usage:', memUsageMB);
  
  if (memUsageMB.heapUsed > 100) {
    console.warn('⚠️ High memory usage detected');
  }
}

// Set up periodic tasks
const cleanupInterval = setInterval(cleanupExpiredClips, 5 * 60 * 1000); // Every 5 minutes
const memoryInterval = setInterval(monitorMemory, 10 * 60 * 1000); // Every 10 minutes

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
  if (memoryInterval) {
    clearInterval(memoryInterval);
    console.log('💾 Memory monitoring interval cleared');
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
      console.log(`🚀 Qopy server (simple) running on port ${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗄️ Database: PostgreSQL (Railway)`);
      console.log(`📊 Database connection pool initialized`);
      console.log(`🚫 Spam filtering: DISABLED (simple mode)`);
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