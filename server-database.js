const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const { body, param, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 Qopy Server (Database) starting...');
console.log(`📋 Port: ${PORT}`);
console.log(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`📋 Railway: ${process.env.RAILWAY_ENVIRONMENT || 'local'}`);

// Database Configuration
const DB_PATH = process.env.DB_PATH || (process.env.RAILWAY_ENVIRONMENT ? '/tmp/qopy.db' : path.join(__dirname, 'data', 'qopy.db'));

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`📁 Created data directory: ${dataDir}`);
}

// Initialize database connection
let db;
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('❌ Error opening database:', err.message);
        reject(err);
        return;
      }
      console.log('✅ Connected to SQLite database');
      
      // Enable foreign keys and WAL mode for better performance
      db.run('PRAGMA foreign_keys = ON');
      db.run('PRAGMA journal_mode = WAL');
      db.run('PRAGMA synchronous = NORMAL');
      
      resolve();
    });
  });
}

// Security Configuration Check
if (!process.env.ADMIN_TOKEN) {
  console.log('');
  console.log('⚠️  SECURITY WARNING: ADMIN_TOKEN not configured!');
  console.log('   Admin dashboard will be DISABLED for security.');
  console.log('   Set ADMIN_TOKEN environment variable to enable admin features.');
  console.log('   Run: npm run setup-admin (to generate secure token)');
  console.log('');
} else {
  console.log('✅ Admin token configured');
}

// Domain Configuration Check
if (process.env.NODE_ENV === 'production') {
  if (process.env.DOMAIN) {
    console.log(`🌐 Production domain: ${process.env.DOMAIN}`);
  } else {
    console.log('🌐 Production domain: qopy.app (hardcoded)');
  }
  console.log('🔒 CORS: qopy.app automatically allowed');
} else {
  console.log('🌐 Development mode: localhost origins allowed');
}

// Trust proxy for Railway deployment
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
} else {
  app.set('trust proxy', true);
}

// EARLY HEALTH CHECK (before any complex middleware)
app.get('/api/health', (req, res) => {
  console.log('🩺 Health check requested - uptime:', process.uptime());
  const response = {
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    railway: !!process.env.RAILWAY_ENVIRONMENT,
    version: 'database-1.0.0',
    memory: process.memoryUsage(),
    pid: process.pid,
    database: 'SQLite'
  };
  
  // Add database stats if available
  if (db) {
    db.get('SELECT COUNT(*) as total_clips FROM clips', (err, row) => {
      if (!err && row) {
        response.totalClips = row.total_clips;
      }
      db.get('SELECT COUNT(*) as active_clips FROM clips WHERE is_expired = 0', (err, row) => {
        if (!err && row) {
          response.activeClips = row.active_clips;
        }
        console.log('🩺 Health check response sent');
        res.status(200).json(response);
      });
    });
  } else {
    response.note = 'Database not yet initialized';
    console.log('🩺 Health check response sent');
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

// EARLY LOGGING FUNCTION (before any usage)
function simpleLog(level, message, metadata = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
  if (Object.keys(metadata).length > 0) {
    console.log('  Metadata:', JSON.stringify(metadata));
  }
}

console.log('✅ Early functions initialized');

// IP Blacklist Management
const blockedIPs = new Set([
  // Will be populated from external sources
]);

// IP-Blockierung Statistiken
let ipBlockStats = {
  totalBlocked: 0,
  lastUpdated: Date.now(),
  sources: []
};

// Spam filter statistics
let spamStats = {
  totalAnalyzed: 0,
  blocked: 0,
  suspicious: 0,
  lastReset: Date.now()
};

console.log('✅ Storage initialized');

// Enhanced middleware configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for admin dashboard
      scriptSrcAttr: ["'unsafe-inline'"], // Allow onclick attributes
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Secure CORS Configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
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
      // Railway auto-generated domains
      if (process.env.RAILWAY_STATIC_URL) {
        allowedOrigins.push(`https://${process.env.RAILWAY_STATIC_URL}`);
      }
      if (process.env.RAILWAY_PUBLIC_DOMAIN) {
        allowedOrigins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
      }
      
      // Custom domain from environment
      if (process.env.DOMAIN) {
        allowedOrigins.push(`https://${process.env.DOMAIN}`);
        allowedOrigins.push(`http://${process.env.DOMAIN}`); // Fallback for dev
      }
      
      // Qopy.app production domain (hardcoded for security)
      allowedOrigins.push('https://qopy.app');
      allowedOrigins.push('http://qopy.app'); // Fallback for dev
      
      // Additional allowed origins from environment (comma-separated)
      if (process.env.ALLOWED_ORIGINS) {
        const additionalOrigins = process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
        allowedOrigins.push(...additionalOrigins);
      }
      
      // Fallback: if no origins configured in production, allow current host
      if (allowedOrigins.length === 0) {
        console.warn('⚠️ No CORS origins configured for production. Using permissive fallback.');
        return callback(null, true);
      }
    }
    
    // Log CORS attempt for security monitoring
    if (typeof logMessage === 'function') {
      logMessage('debug', `CORS check for origin: ${origin}`, {
        allowedOrigins,
        isAllowed: allowedOrigins.includes(origin)
      });
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '100kb' }));
app.use(express.static('public'));

// Rate limiting
const rateLimitWindow = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000; // 15 minutes
const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 20;

const limiter = rateLimit({
  windowMs: rateLimitWindow,
  max: rateLimitMax,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(rateLimitWindow / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`🚫 Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(rateLimitWindow / 1000)
    });
  }
});

app.use('/api/', limiter);

// Utility functions
function getBaseUrl(req) {
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const host = req.headers.host || req.connection.remoteAddress;
  return `${protocol}://${host}`;
}

// Database utility functions
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Load external spam lists
async function loadExternalSpamLists() {
  try {
    const spamListPath = path.join(__dirname, 'data', 'spam-ips.json');
    if (fs.existsSync(spamListPath)) {
      const data = fs.readFileSync(spamListPath, 'utf8');
      const spamList = JSON.parse(data);
      
      if (spamList.ips && Array.isArray(spamList.ips)) {
        spamList.ips.forEach(ip => blockedIPs.add(ip));
        console.log(`✅ Loaded ${spamList.ips.length} spam IPs from local file`);
        ipBlockStats.sources.push('local-file');
        ipBlockStats.lastUpdated = Date.now();
      }
    }
  } catch (error) {
    console.error('❌ Error loading spam lists:', error.message);
  }
}

// Blacklist management functions
function addToBlacklist(ip, reason = 'Manual') {
  blockedIPs.add(ip);
  ipBlockStats.totalBlocked++;
  console.log(`🚫 Added IP to blacklist: ${ip} (${reason})`);
}

function removeFromBlacklist(ip) {
  const wasBlocked = blockedIPs.has(ip);
  blockedIPs.delete(ip);
  if (wasBlocked) {
    console.log(`✅ Removed IP from blacklist: ${ip}`);
  }
  return wasBlocked;
}

function checkBlacklist(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress;
  
  if (blockedIPs.has(clientIP)) {
    console.warn(`🚫 Blocked request from blacklisted IP: ${clientIP}`);
    ipBlockStats.totalBlocked++;
    return res.status(403).json({
      error: 'Access denied',
      message: 'Your IP address has been blocked due to suspicious activity.'
    });
  }
  
  next();
}

app.use(checkBlacklist);

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
    const result = await dbRun(
      'UPDATE clips SET is_expired = 1 WHERE expiration_time <= ? AND is_expired = 0',
      [now]
    );
    
    if (result.changes > 0) {
      console.log(`🧹 Cleaned up ${result.changes} expired clips`);
    }
  } catch (error) {
    console.error('❌ Error cleaning up expired clips:', error.message);
  }
}

// Content analysis for spam detection
function analyzeContent(content) {
  const analysis = {
    isSpam: false,
    score: 0,
    reasons: []
  };
  
  // Check for excessive repetition
  const words = content.toLowerCase().split(/\s+/);
  const wordCount = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });
  
  const repeatedWords = Object.entries(wordCount).filter(([word, count]) => count > 5);
  if (repeatedWords.length > 0) {
    analysis.score += 20;
    analysis.reasons.push('excessive_word_repetition');
  }
  
  // Check for suspicious patterns
  const suspiciousPatterns = [
    /buy\s+now/i,
    /click\s+here/i,
    /limited\s+time/i,
    /act\s+now/i,
    /free\s+offer/i,
    /make\s+money/i,
    /earn\s+cash/i,
    /work\s+from\s+home/i
  ];
  
  suspiciousPatterns.forEach(pattern => {
    if (pattern.test(content)) {
      analysis.score += 10;
      analysis.reasons.push('suspicious_pattern');
    }
  });
  
  // Check for excessive links
  const linkCount = (content.match(/https?:\/\/[^\s]+/g) || []).length;
  if (linkCount > 3) {
    analysis.score += 15;
    analysis.reasons.push('excessive_links');
  }
  
  // Check for excessive caps
  const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
  if (capsRatio > 0.7) {
    analysis.score += 10;
    analysis.reasons.push('excessive_caps');
  }
  
  analysis.isSpam = analysis.score >= 30;
  return analysis;
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

    // Content analysis
    const analysis = analyzeContent(content);
    spamStats.totalAnalyzed++;
    
    if (analysis.isSpam) {
      spamStats.blocked++;
      addToBlacklist(clientIP, 'spam_content');
      return res.status(400).json({
        error: 'Content blocked',
        message: 'Your content appears to be spam and has been blocked.'
      });
    }
    
    if (analysis.score > 15) {
      spamStats.suspicious++;
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
    const now = Date.now();

    // Store clip in database
    await dbRun(`
      INSERT INTO clips (
        clip_id, content, password_hash, expiration_time, created_at,
        one_time, is_expired, created_by_ip, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      clipId,
      content,
      password || null,
      expirationTime,
      now,
      oneTime ? 1 : 0,
      0,
      clientIP,
      userAgent
    ]);

    // Generate QR code
    const shareUrl = `${getBaseUrl(req)}/clip/${clipId}`;
    const qrCode = await QRCode.toDataURL(shareUrl);

    console.log(`✅ Created clip: ${clipId} (expires: ${new Date(expirationTime).toISOString()})`);

    res.json({
      success: true,
      clipId,
      shareUrl,
      qrCode,
      expiresAt: expirationTime,
      expiresIn: expirationTimes[expiration],
      oneTime,
      hasPassword: !!password
    });

  } catch (error) {
    console.error('❌ Error creating clip:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create clip'
    });
  }
});

// Get clip
app.get('/api/clip/:clipId', [
  param('clipId').isLength({ min: 6, max: 6 }).withMessage('Clip ID must be exactly 6 characters'),
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
    const clip = await dbGet(
      'SELECT * FROM clips WHERE clip_id = ? AND is_expired = 0',
      [clipId]
    );

    if (!clip) {
      // Log failed access attempt
      await dbRun(`
        INSERT INTO access_logs (clip_id, ip_address, user_agent, accessed_at, success, error_message)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [clipId, clientIP, userAgent, Date.now(), 0, 'Clip not found']);

      return res.status(404).json({
        error: 'Clip not found',
        message: 'The requested clip does not exist or has expired.'
      });
    }

    // Check if clip has expired
    if (clip.expiration_time <= Date.now()) {
      await dbRun(
        'UPDATE clips SET is_expired = 1 WHERE clip_id = ?',
        [clipId]
      );

      await dbRun(`
        INSERT INTO access_logs (clip_id, ip_address, user_agent, accessed_at, success, error_message)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [clipId, clientIP, userAgent, Date.now(), 0, 'Clip expired']);

      return res.status(404).json({
        error: 'Clip expired',
        message: 'The requested clip has expired.'
      });
    }

    // Check password if required
    if (clip.password_hash && clip.password_hash !== password) {
      await dbRun(`
        INSERT INTO access_logs (clip_id, ip_address, user_agent, accessed_at, success, error_message)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [clipId, clientIP, userAgent, Date.now(), 0, 'Invalid password']);

      return res.status(401).json({
        error: 'Invalid password',
        message: 'The password provided is incorrect.'
      });
    }

    // Update access statistics
    await dbRun(`
      UPDATE clips 
      SET accessed_at = ?, access_count = access_count + 1
      WHERE clip_id = ?
    `, [Date.now(), clipId]);

    // Log successful access
    await dbRun(`
      INSERT INTO access_logs (clip_id, ip_address, user_agent, accessed_at, success)
      VALUES (?, ?, ?, ?, ?)
    `, [clipId, clientIP, userAgent, Date.now(), 1]);

    // Handle one-time access
    if (clip.one_time) {
      await dbRun(
        'UPDATE clips SET is_expired = 1 WHERE clip_id = ?',
        [clipId]
      );
      console.log(`🗑️ One-time clip accessed and deleted: ${clipId}`);
    }

    console.log(`📋 Retrieved clip: ${clipId}`);

    res.json({
      success: true,
      content: clip.content,
      expiresAt: clip.expiration_time,
      oneTime: !!clip.one_time,
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
    const stats = await dbGet('SELECT COUNT(*) as total_clips FROM clips');
    const activeStats = await dbGet('SELECT COUNT(*) as active_clips FROM clips WHERE is_expired = 0');
    const expiredStats = await dbGet('SELECT COUNT(*) as expired_clips FROM clips WHERE is_expired = 1');
    const recentClips = await dbAll(`
      SELECT clip_id, created_at, access_count, one_time, is_expired
      FROM clips 
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    res.json({
      success: true,
      stats: {
        totalClips: stats.total_clips,
        activeClips: activeStats.active_clips,
        expiredClips: expiredStats.expired_clips,
        blockedIPs: blockedIPs.size,
        spamStats
      },
      recentClips: recentClips.map(clip => ({
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
  
  // Warning if memory usage is high
  if (memUsageMB.heapUsed > 100) {
    console.warn('⚠️ High memory usage detected');
  }
}

// Set up periodic tasks
setInterval(cleanupExpiredClips, 5 * 60 * 1000); // Every 5 minutes
setInterval(monitorMemory, 10 * 60 * 1000); // Every 10 minutes

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
  console.log('🔄 Closing database connection...');
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('❌ Error closing database:', err.message);
      } else {
        console.log('✅ Database connection closed');
      }
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

// Initialize and start server
async function startServer() {
  try {
    await initializeDatabase();
    await loadExternalSpamLists();
    
    const server = app.listen(PORT, () => {
      console.log(`🚀 Qopy server running on port ${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗄️ Database: ${DB_PATH}`);
      console.log(`📊 Database initialized successfully`);
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