const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const { body, param, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 Qopy Server (Fixed) starting...');
console.log(`📋 Port: ${PORT}`);
console.log(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`📋 Railway: ${process.env.RAILWAY_ENVIRONMENT || 'local'}`);

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
    version: 'fixed-1.0.0',
    memory: process.memoryUsage(),
    pid: process.pid
  };
  
  // Add detailed info only if server is fully initialized
  try {
    if (typeof clips !== 'undefined') {
      response.activeClips = clips.size;
    }
    if (typeof blockedIPs !== 'undefined') {
      response.blockedIPs = blockedIPs.size;
    }
    if (typeof spamStats !== 'undefined') {
      response.spamStats = {
        totalAnalyzed: spamStats.totalAnalyzed,
        blocked: spamStats.blocked,
        suspicious: spamStats.suspicious
      };
    }
  } catch (error) {
    response.note = 'Server starting, some stats not yet available';
  }
  
  console.log('🩺 Health check response sent');
  res.status(200).json(response);
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

// In-memory storage for clips
const clips = new Map();

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

// Configuration from environment
const SPAM_FILTER_ENABLED = process.env.SPAM_FILTER_ENABLED !== 'false';
const SPAM_SCORE_THRESHOLD = parseInt(process.env.SPAM_SCORE_THRESHOLD) || 50;
const DEBUG_MODE = process.env.DEBUG === 'true';

console.log('✅ Configuration loaded');

// Externe Spam-IP-Listen laden (non-blocking)
function loadExternalSpamLists() {
  const fs = require('fs');
  
  try {
    const spamIPFile = path.join(__dirname, 'data', 'spam-ips.json');
    
    if (fs.existsSync(spamIPFile)) {
      const data = JSON.parse(fs.readFileSync(spamIPFile, 'utf8'));
      
      console.log(`📥 Loading ${data.totalIPs} spam IPs from external sources...`);
      
      let loaded = 0;
      for (const ip of data.ips) {
        if (!blockedIPs.has(ip)) {
          blockedIPs.add(ip);
          loaded++;
        }
      }
      
      ipBlockStats.sources = data.sources || [];
      ipBlockStats.lastUpdated = Date.now();
      
      console.log(`✅ Loaded ${loaded} new spam IPs from external sources`);
      console.log(`📊 Total blocked IPs: ${blockedIPs.size}`);
      
      return loaded;
    } else {
      console.log('ℹ️ No external spam IP file found.');
      return 0;
    }
  } catch (error) {
    console.error('❌ Error loading external spam lists:', error.message);
    return 0;
  }
}

// Load spam lists after startup (non-blocking)
setTimeout(() => {
  loadExternalSpamLists();
}, 5000);

// Auto-update every 24 hours
setInterval(() => {
  console.log('🔄 Checking for spam IP list updates...');
  loadExternalSpamLists();
}, 24 * 60 * 60 * 1000);

// Funktion zum Hinzufügen einer IP zur Blacklist
function addToBlacklist(ip, reason = 'Manual') {
  if (!blockedIPs.has(ip)) {
    blockedIPs.add(ip);
    ipBlockStats.totalBlocked++;
    
    simpleLog('info', `IP ${ip} added to blacklist`, {
      ip: ip,
      reason: reason,
      totalBlockedIPs: blockedIPs.size,
      action: 'blacklist_add'
    });
    
    return true;
  }
  return false;
}

// Funktion zum Entfernen einer IP aus der Blacklist
function removeFromBlacklist(ip) {
  if (blockedIPs.has(ip)) {
    blockedIPs.delete(ip);
    
    simpleLog('info', `IP ${ip} removed from blacklist`, {
      ip: ip,
      totalBlockedIPs: blockedIPs.size,
      action: 'blacklist_remove'
    });
    
    return true;
  }
  return false;
}

// Middleware zum Prüfen von blockierten IPs
function checkBlacklist(req, res, next) {
  const clientIP = req.ip;
  
  if (blockedIPs.has(clientIP)) {
    simpleLog('warn', `Blocked request from blacklisted IP: ${clientIP}`, {
      blockedIP: clientIP,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      blocked: true
    });
    
    return res.status(403).json({ 
      error: 'Access denied',
      message: 'Your IP address has been blocked due to suspicious activity.',
      blocked: true,
      ip: clientIP
    });
  }
  
  next();
}

console.log('✅ IP management functions ready');

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

console.log('✅ Basic middleware loaded');

// Rate limiting
const createLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 20,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const retrieveLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_RETRIEVE_REQUESTS) || 100,
  message: { error: 'Too many retrieval requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply IP blacklist and rate limiting to API routes
app.use('/api/clip', checkBlacklist, createLimiter);
app.use('/api', checkBlacklist);

console.log('✅ Rate limiting configured');

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

console.log('✅ Static files enabled');

// Generate 6-character unique ID
function generateClipId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Cleanup expired clips
function cleanupExpiredClips() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [id, clip] of clips.entries()) {
    if (new Date(clip.expiresAt).getTime() < now) {
      clips.delete(id);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} expired clips`);
  }
}

// Cleanup every minute
setInterval(cleanupExpiredClips, 60 * 1000);

console.log('✅ Clip management ready');

// Keep-alive mechanism (from progressive server)
setInterval(() => {
  console.log(`💓 Server heartbeat - uptime: ${process.uptime()}s, memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB, clips: ${clips.size}, blocked IPs: ${blockedIPs.size}`);
}, 60000); // Every minute

console.log('✅ Keep-alive enabled');

// I'll continue with the rest of the routes in the next part...
// This is a foundation with all the critical fixes applied.

// Basic routes first
app.get('/', (req, res) => {
  console.log('📱 Root endpoint accessed');
  res.json({
    message: 'Qopy Server is running',
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    activeClips: clips.size,
    version: 'fixed-1.0.0'
  });
});

// Essential spam filter (simplified)
function analyzeContent(content) {
  const analysis = {
    isSuspicious: false,
    reasons: [],
    score: 0
  };

  const lowerContent = content.toLowerCase();
  
  // Only the most obvious spam keywords
  const CRITICAL_SPAM_KEYWORDS = [
    'free money', 'click here', 'buy now', 'limited time',
    'make money fast', 'get rich quick', 'work from home',
    'guaranteed income', 'no experience needed'
  ];
  
  for (const keyword of CRITICAL_SPAM_KEYWORDS) {
    if (lowerContent.includes(keyword)) {
      analysis.isSuspicious = true;
      analysis.reasons.push(`Spam keyword: "${keyword}"`);
      analysis.score += 20;
    }
  }
  
  // Basic heuristics
  const urlMatches = content.match(/https?:\/\/[^\s]+/gi) || [];
  if (urlMatches.length > 15) {
    analysis.isSuspicious = true;
    analysis.reasons.push(`Too many URLs: ${urlMatches.length}`);
    analysis.score += 25;
  }
  
  return analysis;
}

console.log('✅ Spam filter ready');

// Validation middleware
const MAX_CONTENT_LENGTH = parseInt(process.env.MAX_CONTENT_LENGTH) || 100000;

// Create new clip (essential functionality)
app.post('/api/clip', (req, res) => {
  try {
    const { content, expiration = '24hr', oneTime = false, password } = req.body;
    
    // Basic validation
    if (!content || content.length > MAX_CONTENT_LENGTH) {
      return res.status(400).json({ 
        error: 'Invalid content',
        message: `Content must be between 1 and ${MAX_CONTENT_LENGTH.toLocaleString()} characters`
      });
    }
    
    // Spam filter (if enabled)
    if (SPAM_FILTER_ENABLED) {
      const spamAnalysis = analyzeContent(content);
      spamStats.totalAnalyzed++;
      
      if (spamAnalysis.score >= SPAM_SCORE_THRESHOLD) {
        spamStats.blocked++;
        simpleLog('warn', `Spam content blocked from IP ${req.ip}`, {
          score: spamAnalysis.score,
          reasons: spamAnalysis.reasons
        });
        
        return res.status(403).json({
          error: 'Content blocked',
          message: 'Your content was flagged as potential spam.',
          reasons: spamAnalysis.reasons
        });
      }
      
      if (spamAnalysis.score > 0) {
        spamStats.suspicious++;
      }
    }
    
    // Generate clip
    const id = generateClipId();
    
    // Calculate expiration
    const expirationMs = {
      '5min': 5 * 60 * 1000,
      '15min': 15 * 60 * 1000,
      '30min': 30 * 60 * 1000,
      '1hr': 60 * 60 * 1000,
      '6hr': 6 * 60 * 60 * 1000,
      '24hr': 24 * 60 * 60 * 1000
    };
    
    const clip = {
      id,
      content,
      password: password || null,
      oneTime,
      expiresAt: new Date(Date.now() + (expirationMs[expiration] || expirationMs['24hr'])).toISOString(),
      createdAt: new Date().toISOString(),
      retrieved: false
    };
    
    clips.set(id, clip);
    
    simpleLog('info', `Clip created: ${id}`, {
      expiration,
      oneTime,
      hasPassword: !!password,
      ip: req.ip
    });
    
    res.json({
      success: true,
      id,
      url: `${req.protocol}://${req.get('host')}/${id}`,
      expiresAt: clip.expiresAt
    });
    
  } catch (error) {
    console.error('❌ Clip creation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

console.log('✅ Clip creation endpoint ready');

// Retrieve clip
app.get('/api/clip/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    
    if (!id || id.length !== 6) {
      return res.status(400).json({ error: 'Invalid clip ID' });
    }
    
    const clip = clips.get(id);
    if (!clip) {
      return res.status(404).json({ error: 'Clip not found' });
    }
    
    // Check expiration
    if (new Date(clip.expiresAt) < new Date()) {
      clips.delete(id);
      return res.status(410).json({ error: 'Clip has expired' });
    }
    
    // Check password
    if (clip.password && clip.password !== password) {
      return res.status(401).json({ error: 'Password required' });
    }
    
    // One-time check
    if (clip.oneTime && clip.retrieved) {
      clips.delete(id);
      return res.status(410).json({ error: 'Clip has already been retrieved' });
    }
    
    // Mark as retrieved
    clip.retrieved = true;
    
    // Delete if one-time
    if (clip.oneTime) {
      clips.delete(id);
    }
    
    simpleLog('info', `Clip retrieved: ${id}`, {
      oneTime: clip.oneTime,
      deleted: clip.oneTime,
      ip: req.ip
    });
    
    res.json({
      success: true,
      content: clip.content,
      createdAt: clip.createdAt,
      expiresAt: clip.expiresAt
    });
    
  } catch (error) {
    console.error('❌ Clip retrieval error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

console.log('✅ Clip retrieval endpoint ready');

// Check clip info
app.head('/api/clip/:id', (req, res) => {
  const { id } = req.params;
  const clip = clips.get(id);
  
  if (!clip || new Date(clip.expiresAt) < new Date()) {
    return res.status(404).end();
  }
  
  res.json({
    success: true,
    hasPassword: !!clip.password,
    oneTime: clip.oneTime,
    expiresAt: clip.expiresAt,
    createdAt: clip.createdAt
  });
});

console.log('✅ Essential routes completed');

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Qopy Server (Fixed) running on 0.0.0.0:${PORT}`);
  console.log(`🩺 Health check: http://0.0.0.0:${PORT}/api/health`);
  console.log(`✅ All essential features loaded`);
  
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    console.log(`🌐 Public: https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
    console.log(`🩺 Health: https://${process.env.RAILWAY_PUBLIC_DOMAIN}/api/health`);
  }
});

server.on('error', (err) => {
  console.error('❌ Server startup error:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📡 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('📡 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
}); 