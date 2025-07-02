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
    version: 'fixed-1.0.2-admin-debug',
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
        origin: origin,
        allowed: allowedOrigins.includes(origin),
        environment: process.env.NODE_ENV,
        allowedOrigins: allowedOrigins
      });
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      if (typeof logMessage === 'function') {
        logMessage('warn', `CORS blocked origin: ${origin}`, {
          origin: origin,
          allowedOrigins: allowedOrigins
        });
      }
      callback(new Error('CORS policy violation: Origin not allowed'));
    }
  },
  credentials: true, // Allow cookies and auth headers  
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With', 
    'Content-Type', 
    'Accept',
    'Authorization',
    'Cache-Control'
  ],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86400 // 24 hours preflight cache
};

app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Rate limiting will be defined later

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

console.log('✅ Enhanced middleware initialized');

// Helper function for consistent base URL generation
function getBaseUrl(req) {
  if (process.env.NODE_ENV === 'production' && process.env.DOMAIN) {
    return `https://${process.env.DOMAIN}`;
  }
  return `${req.protocol}://${req.get('host')}`;
}

// Configuration from environment
const SPAM_FILTER_ENABLED = process.env.SPAM_FILTER_ENABLED !== 'false';
const SPAM_SCORE_THRESHOLD = parseInt(process.env.SPAM_SCORE_THRESHOLD) || 50;
const DEBUG_MODE = process.env.DEBUG === 'true';

// Additional spam filter configuration
const LOG_SUSPICIOUS_CONTENT = process.env.LOG_SUSPICIOUS_CONTENT !== 'false'; // Default: enabled

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
    
    // Note: logMessage is defined later, use simpleLog for now
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

console.log('✅ Secure CORS and middleware configured');

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

// Remove the JSON root route - static files will handle it

// Comprehensive spam filter
const SUSPICIOUS_KEYWORDS = [
  // Phishing & Scam
  'urgent action required', 'verify your account', 'suspended account', 'click here immediately',
  'limited time offer', 'act now', 'congratulations you have won', 'claim your prize',
  'nigerian prince', 'inheritance', 'lottery winner', 'tax refund',
  
  // Malware & Hacking
  'download crack', 'free hack', 'keylogger', 'trojan', 'ransomware',
  'exploit kit', 'botnet', 'ddos attack', 'sql injection',
  
  // Illegal Content
  'buy drugs', 'sell drugs', 'illegal weapons', 'fake passport', 'fake id',
  'money laundering', 'credit card fraud', 'identity theft',
  
  // Spam Patterns
  'make money fast', 'work from home', 'get rich quick', 'easy money',
  'no experience required', 'guaranteed income', 'financial freedom',
  
  // Adult/NSFW (basic detection)
  'adult content', 'explicit material', 'nsfw content',
  
  // Cryptocurrency Scams
  'crypto giveaway', 'bitcoin generator', 'free cryptocurrency', 'mining bot',
  'pump and dump', 'rug pull', 'defi exploit',
  
  // Social Engineering
  'your computer has been infected', 'virus detected', 'system error',
  'microsoft support', 'apple support', 'google support', 'tech support scam',
  
  // Investment Scams
  'guaranteed returns', 'risk-free investment', 'insider trading',
  'forex trading bot', 'binary options', 'investment opportunity',
  
  // Romance/Dating Scams
  'lonely widow', 'military overseas', 'stranded abroad', 'need money urgently',
  
  // Job Scams
  'envelope stuffing', 'mystery shopper', 'easy home job',
  'pay processing', 'reshipping', 'money transfer agent',
  
  // Fake Services
  'fake reviews', 'buy followers', 'boost engagement', 'fake likes',
  'academic writing', 'essay writing service', 'homework help',
  
  // Malicious Links
  'download now', 'install software', 'update required', 'security update',
  'adobe flash update', 'java update', 'browser update'
];

const SUSPICIOUS_PATTERNS = [
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, // Credit card numbers
  /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g, // SSN patterns
  /(?:https?:\/\/)?bit\.ly\/\w+/gi, // Shortened URLs (often spam)
  /(?:https?:\/\/)?tinyurl\.com\/\w+/gi, // Shortened URLs
  /(?:https?:\/\/)?t\.co\/\w+/gi, // Twitter shortened URLs
  /\b(?:call|text|whatsapp)[\s:]+\+?\d{10,15}\b/gi, // Phone numbers in suspicious context
  /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}[A-Z0-9]{1,23}\b/g, // IBAN patterns
];

function analyzeContent(content) {
  const analysis = {
    isSuspicious: false,
    reasons: [],
    score: 0
  };

  const lowerContent = content.toLowerCase();
  
  // Check for suspicious keywords
  for (const keyword of SUSPICIOUS_KEYWORDS) {
    if (lowerContent.includes(keyword.toLowerCase())) {
      analysis.isSuspicious = true;
      analysis.reasons.push(`Suspicious keyword: "${keyword}"`);
      analysis.score += 10;
    }
  }
  
  // Check for suspicious patterns
  for (const pattern of SUSPICIOUS_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      analysis.isSuspicious = true;
      analysis.reasons.push(`Suspicious pattern detected: ${pattern.toString()}`);
      analysis.score += 15;
    }
  }
  
  // Additional heuristics
  const lines = content.split('\n');
  const words = content.split(/\s+/);
  
  // Too many URLs (potential spam) - increased threshold
  const urlMatches = content.match(/https?:\/\/[^\s]+/gi) || [];
  if (urlMatches.length > 10) {
    analysis.isSuspicious = true;
    analysis.reasons.push(`Too many URLs detected: ${urlMatches.length}`);
    analysis.score += 15;
  }
  
  // Excessive repetition
  const uniqueLines = new Set(lines.map(line => line.trim().toLowerCase()));
  if (lines.length > 10 && uniqueLines.size / lines.length < 0.5) {
    analysis.isSuspicious = true;
    analysis.reasons.push('Excessive repetition detected');
    analysis.score += 15;
  }
  
  // Too many uppercase words (SPAM STYLE) - more lenient for code
  const uppercaseWords = words.filter(word => word.length > 3 && word === word.toUpperCase() && !/^[A-Z_]+$/.test(word)); // Exclude constants
  if (uppercaseWords.length > words.length * 0.5) {
    analysis.isSuspicious = true;
    analysis.reasons.push('Excessive uppercase text');
    analysis.score += 5;
  }
  
  // Excessive special characters - more lenient for code
  const specialChars = content.match(/[!@#$%^&*()_+={}\[\]|\\:";'<>?,./]/g) || [];
  if (specialChars.length > content.length * 0.4) {
    analysis.isSuspicious = true;
    analysis.reasons.push('Excessive special characters');
    analysis.score += 5;
  }
  
  // Suspicious file extensions (only really dangerous ones)
  const suspiciousExtensions = content.match(/\.(exe|bat|cmd|scr|pif|com|vbs|ps1)\b/gi) || [];
  if (suspiciousExtensions.length > 0) {
    analysis.isSuspicious = true;
    analysis.reasons.push(`Suspicious file extensions: ${suspiciousExtensions.join(', ')}`);
    analysis.score += 25;
  }
  
  // Excessive emoji usage (spam indicator)
  const emojiPattern = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
  const emojiMatches = content.match(emojiPattern) || [];
  if (emojiMatches.length > words.length * 0.3) {
    analysis.isSuspicious = true;
    analysis.reasons.push('Excessive emoji usage');
    analysis.score += 10;
  }
  
  // Suspicious IP addresses - more lenient for network configs
  const ipPattern = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
  const ipMatches = content.match(ipPattern) || [];
  if (ipMatches.length > 5) {
    analysis.isSuspicious = true;
    analysis.reasons.push(`Many IP addresses detected: ${ipMatches.length}`);
    analysis.score += 10;
  }
  
  return analysis;
}

console.log('✅ Spam filter ready');

// Validation middleware
const MAX_CONTENT_LENGTH = parseInt(process.env.MAX_CONTENT_LENGTH) || 100000;

// Validation middleware definitions (MUST be before route usage)
const validateClipCreation = [
  body('content')
    .trim()
    .isLength({ min: 1, max: MAX_CONTENT_LENGTH })
    .withMessage(`Content must be between 1 and ${MAX_CONTENT_LENGTH.toLocaleString()} characters`),
  body('expiration')
    .isIn(['5min', '15min', '30min', '1hr', '6hr', '24hr'])
    .withMessage('Invalid expiration time'),
  body('oneTime')
    .optional()
    .isBoolean()
    .withMessage('oneTime must be a boolean'),
  body('password')
    .optional()
    .isLength({ max: 128 })
    .withMessage('Password must be less than 128 characters')
];

const validateClipRetrieval = [
  param('id')
    .isLength({ min: 6, max: 6 })
    .matches(/^[A-Z0-9]+$/)
    .withMessage('Invalid clip ID format'),
  body('password')
    .optional()
    .isLength({ max: 128 })
    .withMessage('Password must be less than 128 characters')
];

console.log('✅ Validation middleware defined');

// Create new clip with full validation
app.post('/api/clip', validateClipCreation, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  try {
    const { content, expiration = '24hr', oneTime = false, password } = req.body;
    
    // Enhanced spam filter analysis
    if (SPAM_FILTER_ENABLED) {
      const spamAnalysis = analyzeContent(content);
      
      // Update statistics
      spamStats.totalAnalyzed++;
      if (spamAnalysis.score > 0) spamStats.suspicious++;
      
      // Log suspicious content if enabled
      if (LOG_SUSPICIOUS_CONTENT && spamAnalysis.score > 0) {
        logMessage('warn', `⚠️ Suspicious content detected from IP ${req.ip}`, {
          score: spamAnalysis.score,
          threshold: SPAM_SCORE_THRESHOLD,
          blocked: spamAnalysis.score >= SPAM_SCORE_THRESHOLD,
          reasons: spamAnalysis.reasons,
          contentPreview: content.substring(0, 100) + '...'
        });
      }
      
      // Block if score exceeds threshold
      if (spamAnalysis.score >= SPAM_SCORE_THRESHOLD) {
        spamStats.blocked++;
        
        // Auto-add repeat offenders to IP blacklist
        if (spamAnalysis.score > SPAM_SCORE_THRESHOLD * 2) {
          addToBlacklist(req.ip, `Auto-blocked for high spam score: ${spamAnalysis.score}`);
          logMessage('warn', `🚫 IP ${req.ip} auto-added to blacklist for spam score ${spamAnalysis.score}`, {
            autoBlocked: true,
            score: spamAnalysis.score,
            threshold: SPAM_SCORE_THRESHOLD
          });
        }
        
        return res.status(403).json({
          error: 'Content blocked',
          message: 'Your content was flagged as potential spam.',
          score: spamAnalysis.score,
          threshold: SPAM_SCORE_THRESHOLD
        });
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
    
         logMessage('info', `Clip created: ${id}`, {
       expiration,
       oneTime,
       hasPassword: !!password,
       ip: req.ip
     });
    
    // Generate QR code and send complete response
    const shareUrl = `${getBaseUrl(req)}/${id}`;
    
    QRCode.toDataURL(shareUrl, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    }, (err, dataUrl) => {
      if (err) {
        console.error('❌ QR Code generation error:', err);
        // Send response without QR code
        return res.json({
          success: true,
          clipId: id,
          shareUrl: shareUrl,
          qrCode: null,
          expiresAt: clip.expiresAt,
          oneTime: clip.oneTime,
          hasPassword: !!password
        });
      }
      
      // Send response with QR code
      res.json({
        success: true,
        clipId: id,
        shareUrl: shareUrl,
        qrCode: dataUrl,
        expiresAt: clip.expiresAt,
        oneTime: clip.oneTime,
        hasPassword: !!password
      });
    });
    
  } catch (error) {
    console.error('❌ Clip creation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

console.log('✅ Clip creation endpoint ready');

// Retrieve clip (GET for password-less clips)
app.get('/api/clip/:id', retrieveLimiter, validateClipRetrieval.slice(0, 1), (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid clip ID format' });
  }

  try {
    const { id } = req.params;
    
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
    
         logMessage('info', `Clip retrieved: ${id}`, {
       oneTime: clip.oneTime,
       deleted: clip.oneTime,
       ip: req.ip
     });
    
    res.json({
      success: true,
      content: clip.content,
      createdAt: clip.createdAt,
      expiresAt: clip.expiresAt,
      oneTime: clip.oneTime
    });
    
  } catch (error) {
    console.error('❌ Clip retrieval error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Retrieve clip with password (POST)
app.post('/api/clip/:id', retrieveLimiter, validateClipRetrieval, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid clip ID format' });
  }

  try {
    const { id } = req.params;
    const { password } = req.body;
    
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
      return res.status(401).json({ error: 'Password required or incorrect' });
    }
    
    // One-time check
    if (clip.oneTime && clip.retrieved) {
      clips.delete(id);
      return res.status(410).json({ error: 'This clip has been viewed and destroyed' });
    }
    
    // Mark as retrieved
    clip.retrieved = true;
    
    // Delete if one-time
    if (clip.oneTime) {
      setTimeout(() => clips.delete(id), 100);
    }
    
    logMessage('info', `Clip retrieved via POST: ${id}`, {
      oneTime: clip.oneTime,
      hasPassword: !!clip.password,
      ip: req.ip
    });
    
    res.json({
      success: true,
      content: clip.content,
      createdAt: clip.createdAt,
      expiresAt: clip.expiresAt,
      oneTime: clip.oneTime
    });
    
  } catch (error) {
    console.error('❌ Clip retrieval (POST) error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

console.log('✅ Clip retrieval endpoints ready');

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

// QR Code generation endpoint
app.get('/api/qr/:id', (req, res) => {
  try {
    const { id } = req.params;
    
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
    
    const url = `${getBaseUrl(req)}/${id}`;
    
    QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    }, (err, dataUrl) => {
      if (err) {
        console.error('❌ QR Code generation error:', err);
        return res.status(500).json({ error: 'Failed to generate QR code' });
      }
      
      res.json({
        success: true,
        qrCode: dataUrl,
        url: url,
        id: id
      });
    });
    
  } catch (error) {
    console.error('❌ QR Code endpoint error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Frontend route for clip access
app.get('/:id', (req, res) => {
  const { id } = req.params;
  
  // Check if it's a valid clip ID format
  if (!id || id.length !== 6 || !/^[A-Z0-9]+$/.test(id)) {
    // If not a clip ID, let static files handle it
    return res.redirect('/');
  }
  
  // Check if clip exists (without revealing content)
  const clip = clips.get(id);
  if (!clip || new Date(clip.expiresAt) < new Date()) {
    return res.redirect('/?error=expired');
  }
  
  // Serve the main page (which will handle the clip retrieval via JS)
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Clip info endpoint for frontend
app.get('/api/clip/:id/info', retrieveLimiter, validateClipRetrieval.slice(0, 1), (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid clip ID format' });
  }

  try {
    const { id } = req.params;
    
    const clip = clips.get(id);
    if (!clip) {
      return res.status(404).json({ error: 'Clip not found' });
    }
    
    // Check expiration
    if (new Date(clip.expiresAt) < new Date()) {
      clips.delete(id);
      return res.status(410).json({ error: 'Clip has expired' });
    }
    
    res.json({
      success: true,
      hasPassword: !!clip.password,
      oneTime: clip.oneTime,
      expiresAt: clip.expiresAt,
      createdAt: clip.createdAt
    });
    
  } catch (error) {
    console.error('❌ Clip info error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Legal pages endpoint
app.get('/api/legal', (req, res) => {
  res.json({
    impressum: '/impressum.html',
    datenschutz: '/datenschutz.html',
    agb: '/agb.html',
    updated: '2025-01-01',
    jurisdiction: 'Germany'
  });
});

console.log('✅ Frontend routes completed');
console.log('✅ Essential routes completed');

// Admin Authentication Middleware
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const adminToken = process.env.ADMIN_TOKEN;
  
  // Check if admin token is configured
  if (!adminToken) {
    logMessage('error', 'Admin access attempted but ADMIN_TOKEN not configured', {
      clientIP: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    });
    return res.status(503).json({ 
      error: 'Service Unavailable',
      message: 'Admin functionality is not configured. Please set ADMIN_TOKEN environment variable.'
    });
  }
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logMessage('warn', 'Admin access attempted without proper authorization header', {
      clientIP: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    });
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Admin token required. Set Authorization header with Bearer token.'
    });
  }
  
  const token = authHeader.split(' ')[1];
  
  if (token !== adminToken) {
    logMessage('warn', 'Admin access attempted with invalid token', {
      clientIP: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      tokenLength: token ? token.length : 0
    });
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid admin token.'
    });
  }
  
  logMessage('info', 'Successful admin authentication', {
    clientIP: req.ip,
    endpoint: req.path
  });
  
  next();
}

// In-memory log storage
const systemLogs = [];
const MAX_LOGS = 1000;

// Enhanced logging function
function logMessage(level, message, metadata = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: level,
    message: message,
    metadata: metadata,
    source: 'qopy-server'
  };
  
  systemLogs.push(logEntry);
  
  if (systemLogs.length > MAX_LOGS) {
    systemLogs.shift();
  }
  
  // Use simple console.log to avoid any recursion issues
  const logLine = `[${logEntry.timestamp}] [${level.toUpperCase()}] ${message}`;
  // Just use regular console.log
  try {
    console.log(logLine);
    if (Object.keys(metadata).length > 0) {
      console.log('  Metadata:', JSON.stringify(metadata));
    }
  } catch (error) {
    // Fallback if even console.log fails
  }
}

console.log('✅ Admin system ready');

// Admin info endpoint (no auth required - just shows if admin is available)
app.get('/api/admin/info', (req, res) => {
  const adminAvailable = !!process.env.ADMIN_TOKEN;
  
  res.json({
    success: true,
    adminAvailable: adminAvailable,
    message: adminAvailable 
      ? 'Admin dashboard is available. Use /admin to access.'
      : 'Admin dashboard is disabled. Set ADMIN_TOKEN environment variable to enable.',
    timestamp: new Date().toISOString()
  });
});

// CORS test endpoint (no auth required - for testing CORS configuration)
app.get('/api/cors-test', (req, res) => {
  res.json({
    success: true,
    message: 'CORS test successful',
    origin: req.get('Origin') || 'No origin header',
    corsAllowed: true,
    timestamp: new Date().toISOString(),
    requestHeaders: {
      'user-agent': req.get('User-Agent'),
      'origin': req.get('Origin'),
      'referer': req.get('Referer')
    }
  });
});

// Admin endpoints
app.get('/api/admin/stats', requireAdminAuth, (req, res) => {
  logMessage('info', `[ADMIN] Stats accessed by IP ${req.ip}`, { 
    endpoint: '/api/admin/stats',
    method: 'GET' 
  });
  
  res.json({
    success: true,
    stats: {
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid,
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development'
      },
      clips: {
        active: clips.size,
        total: spamStats.totalAnalyzed
      },
      spam: {
        totalAnalyzed: spamStats.totalAnalyzed,
        blocked: spamStats.blocked,
        suspicious: spamStats.suspicious,
        blockRate: spamStats.totalAnalyzed > 0 ? (spamStats.blocked / spamStats.totalAnalyzed * 100).toFixed(2) + '%' : '0%'
      },
      ipBlocking: {
        totalBlockedIPs: blockedIPs.size,
        lastUpdated: new Date(ipBlockStats.lastUpdated).toISOString(),
        sources: ipBlockStats.sources
      }
    }
  });
});

app.get('/api/admin/blacklist', requireAdminAuth, (req, res) => {
  logMessage('info', `[ADMIN] Blacklist accessed by IP ${req.ip}`, { 
    endpoint: '/api/admin/blacklist',
    method: 'GET' 
  });
  
  res.json({
    success: true,
    blockedIPs: Array.from(blockedIPs),
    stats: ipBlockStats
  });
});

app.post('/api/admin/blacklist', requireAdminAuth, (req, res) => {
  const { ip, reason } = req.body;
  
  if (!ip || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    logMessage('warn', `[ADMIN] Invalid IP format attempted: ${ip}`, { 
      adminIP: req.ip,
      attemptedIP: ip 
    });
    return res.status(400).json({ error: 'Invalid IP address format' });
  }
  
  const added = addToBlacklist(ip, reason || 'Manual admin action');
  
  logMessage('info', `[ADMIN] IP ${ip} ${added ? 'added to' : 'already in'} blacklist`, {
    adminIP: req.ip,
    targetIP: ip,
    reason: reason || 'Manual admin action',
    action: 'add'
  });
  
  res.json({
    success: true,
    added: added,
    message: added ? `IP ${ip} added to blacklist` : `IP ${ip} already in blacklist`
  });
});

app.delete('/api/admin/blacklist/:ip', requireAdminAuth, (req, res) => {
  const ip = req.params.ip;
  
  const removed = removeFromBlacklist(ip);
  
  logMessage('info', `[ADMIN] IP ${ip} ${removed ? 'removed from' : 'not found in'} blacklist`, {
    adminIP: req.ip,
    targetIP: ip,
    action: 'remove'
  });
  
  res.json({
    success: true,
    removed: removed,
    message: removed ? `IP ${ip} removed from blacklist` : `IP ${ip} not found in blacklist`
  });
});

app.get('/api/admin/logs', requireAdminAuth, (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const level = req.query.level;
  
  let logs = [...systemLogs];
  
  if (level) {
    logs = logs.filter(log => log.level === level);
  }
  
  logs = logs.slice(-limit).reverse();
  
  res.json({
    success: true,
    logs: logs,
    total: systemLogs.length,
    filtered: logs.length
  });
});

app.get('/api/admin/cors-config', requireAdminAuth, (req, res) => {
  logMessage('info', `[ADMIN] CORS configuration accessed by IP ${req.ip}`, { 
    endpoint: '/api/admin/cors-config',
    method: 'GET' 
  });
  
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
    if (process.env.RAILWAY_STATIC_URL) {
      allowedOrigins.push(`https://${process.env.RAILWAY_STATIC_URL}`);
    }
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      allowedOrigins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
    }
    if (process.env.DOMAIN) {
      allowedOrigins.push(`https://${process.env.DOMAIN}`);
      allowedOrigins.push(`http://${process.env.DOMAIN}`);
    }
    
    // Qopy.app production domain (hardcoded for security)
    allowedOrigins.push('https://qopy.app');
    allowedOrigins.push('http://qopy.app'); // Fallback for dev
    
    if (process.env.ALLOWED_ORIGINS) {
      const additionalOrigins = process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
      allowedOrigins.push(...additionalOrigins);
    }
  }
  
  res.json({
    success: true,
    corsConfig: {
      environment: process.env.NODE_ENV || 'development',
      allowedOrigins: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      maxAge: 86400
    },
    environmentVariables: {
      DOMAIN: process.env.DOMAIN || 'not set',
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'not set',
      RAILWAY_STATIC_URL: process.env.RAILWAY_STATIC_URL || 'not set',
      RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN || 'not set'
    }
  });
});

// Enhanced console logging will use existing systemLogs array

// Override console methods to capture logs (DISABLED to prevent infinite loops)
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// Note: Console override disabled to prevent infinite recursion issues
// All important logs should use logMessage() directly
console.log('⚠️ Console override disabled to prevent infinite loops');

// Debug endpoints for troubleshooting
app.get('/api/admin/debug/process', requireAdminAuth, (req, res) => {
  logMessage('info', `[ADMIN] Process debug info requested`, { adminIP: req.ip });
  
  const processInfo = {
    pid: process.pid,
    ppid: process.ppid,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpuUsage: process.cpuUsage(),
    versions: process.versions,
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT,
      RAILWAY_SERVICE_NAME: process.env.RAILWAY_SERVICE_NAME,
      RAILWAY_REGION: process.env.RAILWAY_REGION,
      DEBUG: process.env.DEBUG
    },
    argv: process.argv,
    execPath: process.execPath,
    cwd: process.cwd()
  };
  
  res.json({
    success: true,
    processInfo: processInfo,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/admin/debug/server', requireAdminAuth, (req, res) => {
  logMessage('info', `[ADMIN] Server debug info requested`, { adminIP: req.ip });
  
  const serverInfo = {
    listening: server ? server.listening : 'server not available',
    connections: server ? (server._connections || 'unknown') : 'server not available',
    maxConnections: server ? server.maxConnections : 'server not available',
    timeout: server ? server.timeout : 'server not available',
    address: server ? server.address() : 'server not available'
  };
  
  res.json({
    success: true,
    serverInfo: serverInfo,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/admin/debug/memory', requireAdminAuth, (req, res) => {
  logMessage('info', `[ADMIN] Memory debug info requested`, { adminIP: req.ip });
  
  const memoryInfo = {
    process: process.memoryUsage(),
    heap: {
      totalHeapSize: 'v8 not available',
      totalHeapSizeExecutable: 'v8 not available',
      totalPhysicalSize: 'v8 not available',
      totalAvailableSize: 'v8 not available',
      usedHeapSize: 'v8 not available',
      heapSizeLimit: 'v8 not available'
    },
    applicationData: {
      activeClips: clips.size,
      blockedIPs: blockedIPs.size,
      systemLogs: systemLogs.length,
      spamStats: spamStats,
      ipBlockStats: ipBlockStats
    }
  };
  
  // Try to get V8 heap statistics if available
  try {
    const v8 = require('v8');
    memoryInfo.heap = v8.getHeapStatistics();
    memoryInfo.heapSpaceStatistics = v8.getHeapSpaceStatistics();
  } catch (error) {
    // V8 module not available or error getting stats
  }
  
  res.json({
    success: true,
    memoryInfo: memoryInfo,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/admin/debug/signals', requireAdminAuth, (req, res) => {
  logMessage('info', `[ADMIN] Signal debug info requested`, { adminIP: req.ip });
  
  const signalInfo = {
    supportedSignals: [
      'SIGTERM', 'SIGINT', 'SIGHUP', 'SIGUSR1', 'SIGUSR2',
      'SIGKILL', 'SIGSTOP', 'SIGCONT', 'SIGQUIT'
    ],
    registeredListeners: {
      SIGTERM: process.listenerCount('SIGTERM'),
      SIGINT: process.listenerCount('SIGINT'),
      SIGHUP: process.listenerCount('SIGHUP'),
      SIGUSR1: process.listenerCount('SIGUSR1'),
      SIGUSR2: process.listenerCount('SIGUSR2'),
      uncaughtException: process.listenerCount('uncaughtException'),
      unhandledRejection: process.listenerCount('unhandledRejection'),
      warning: process.listenerCount('warning')
    },
    debugMode: DEBUG_MODE,
    railwaySignals: {
      description: 'Railway typically sends SIGTERM for graceful shutdown',
      commonCauses: [
        'New deployment',
        'Auto-scaling',
        'Maintenance',
        'Resource limits exceeded',
        'Health check failures'
      ]
    }
  };
  
  res.json({
    success: true,
    signalInfo: signalInfo,
    timestamp: new Date().toISOString()
  });
});

// Force debug dump endpoint
app.post('/api/admin/debug/dump', requireAdminAuth, (req, res) => {
  logMessage('info', `[ADMIN] Full debug dump requested`, { adminIP: req.ip });
  
  const fullDump = {
    timestamp: new Date().toISOString(),
    process: {
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      platform: process.platform,
      nodeVersion: process.version
    },
    server: {
      listening: server ? server.listening : false,
      connections: server ? server._connections : 'unknown',
      address: server ? server.address() : null
    },
    application: {
      activeClips: clips.size,
      blockedIPs: blockedIPs.size,
      systemLogs: systemLogs.length,
      spamStats: spamStats,
      ipBlockStats: ipBlockStats
    },
    memoryMonitoring: {
      current: process.memoryUsage(),
      stats: memoryStats,
      warnings: memoryStats.warnings.length > 0 ? memoryStats.warnings : null
    },
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT,
      DEBUG: process.env.DEBUG,
      ADMIN_TOKEN: process.env.ADMIN_TOKEN ? 'SET' : 'NOT_SET'
    },
    recentLogs: systemLogs.slice(-20) // Last 20 log entries
  };
  
  logMessage('info', '🔍 Full debug dump generated', fullDump);
  
  res.json({
    success: true,
    debugDump: fullDump
  });
});

// Manual spam list update endpoint
app.post('/api/admin/update-spam-lists', requireAdminAuth, (req, res) => {
  logMessage('info', `[ADMIN] Manual spam list update triggered`, { 
    adminIP: req.ip 
  });
  
  // Trigger spam list update
  const loadedCount = loadExternalSpamLists();
  
  res.json({
    success: true,
    message: `Updated spam lists. Loaded ${loadedCount} new IPs.`,
    timestamp: new Date().toISOString()
  });
});

// Detailed health check endpoint
app.get('/api/health/detailed', (req, res) => {
  const response = {
    status: 'OK',
    uptime: process.uptime(),
    activeClips: clips ? clips.size : 0,
    timestamp: new Date().toISOString(),
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    railway: !!process.env.RAILWAY_ENVIRONMENT
  };
  
  // Add detailed info only if server is fully initialized
  try {
    if (spamStats && typeof spamStats.totalAnalyzed !== 'undefined') {
      response.spamFilter = {
        enabled: SPAM_FILTER_ENABLED,
        threshold: SPAM_SCORE_THRESHOLD,
        stats: {
          totalAnalyzed: spamStats.totalAnalyzed,
          suspicious: spamStats.suspicious,
          blocked: spamStats.blocked,
          blockRate: spamStats.totalAnalyzed > 0 ? (spamStats.blocked / spamStats.totalAnalyzed * 100).toFixed(2) + '%' : '0%',
          suspiciousRate: spamStats.totalAnalyzed > 0 ? (spamStats.suspicious / spamStats.totalAnalyzed * 100).toFixed(2) + '%' : '0%'
        }
      };
    }
    
    if (blockedIPs && ipBlockStats) {
      response.ipBlacklist = {
        totalBlockedIPs: blockedIPs.size,
        lastUpdated: new Date(ipBlockStats.lastUpdated).toISOString(),
        sources: ipBlockStats.sources || []
      };
    }
  } catch (error) {
    response.note = 'Some stats not yet available: ' + error.message;
  }
  
  res.status(200).json(response);
});

// Serve the main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve admin dashboard (EXPLICIT ROUTE WITH ERROR HANDLING)
app.get('/admin', (req, res) => {
  console.log('🔧 Admin dashboard requested:', req.url);
  const adminFilePath = path.join(__dirname, 'public', 'admin.html');
  console.log('🔧 Serving file:', adminFilePath);
  
  // Check if file exists first
  const fs = require('fs');
  if (fs.existsSync(adminFilePath)) {
    console.log('✅ Admin file exists, serving...');
    res.sendFile(adminFilePath, (err) => {
      if (err) {
        console.error('❌ Error serving admin.html:', err);
        res.status(500).send('Error loading admin dashboard');
      } else {
        console.log('✅ Admin dashboard served successfully');
      }
    });
  } else {
    console.error('❌ Admin file not found:', adminFilePath);
    res.status(404).send('Admin dashboard not found');
  }
});

// Alternative admin route for testing
app.get('/dashboard', (req, res) => {
  console.log('🔧 Alternative admin dashboard requested:', req.url);
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Admin route test
app.get('/admin-test', (req, res) => {
  console.log('🧪 Admin test route accessed');
  res.json({
    message: 'Admin route is working!',
    timestamp: new Date().toISOString(),
    filePath: path.join(__dirname, 'public', 'admin.html'),
    fileExists: require('fs').existsSync(path.join(__dirname, 'public', 'admin.html'))
  });
});

// DIRECT ADMIN CONTENT ENDPOINT (works around routing issues)
app.get('/api/admin/dashboard', (req, res) => {
  console.log('🔧 Direct admin dashboard content requested');
  const fs = require('fs');
  const adminFilePath = path.join(__dirname, 'public', 'admin.html');
  
  if (fs.existsSync(adminFilePath)) {
    const content = fs.readFileSync(adminFilePath, 'utf8');
    res.setHeader('Content-Type', 'text/html');
    res.send(content);
  } else {
    res.status(404).json({ error: 'Admin dashboard not found' });
  }
});

// ADMIN TOKEN INFO ENDPOINT (for debugging)
app.get('/api/admin/token-info', (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN || 'qopy-admin-2024';
  const isDefaultToken = !process.env.ADMIN_TOKEN;
  
  res.json({
    hasCustomToken: !isDefaultToken,
    defaultToken: isDefaultToken ? adminToken : 'CUSTOM_SET',
    tokenLength: adminToken.length,
    message: isDefaultToken ? 
      `Use default token: ${adminToken}` : 
      'Custom admin token is configured'
  });
});

// EMERGENCY ADMIN TOKEN REVEAL (only works once per server restart)
let tokenRevealed = false;
app.get('/api/admin/emergency-token', (req, res) => {
  if (tokenRevealed) {
    return res.status(403).json({ 
      error: 'Token already revealed', 
      message: 'For security, token can only be revealed once per server restart' 
    });
  }
  
  const adminToken = process.env.ADMIN_TOKEN || 'qopy-admin-2024';
  tokenRevealed = true;
  
  console.log('🚨 EMERGENCY: Admin token revealed via API');
  
  res.json({
    adminToken: adminToken,
    message: 'SECURITY WARNING: Token revealed. Use immediately and consider changing it.',
    expiresAfter: 'This endpoint is now disabled until server restart'
  });
});

// Serve clip retrieval page (CRITICAL MISSING ROUTE)
app.get('/clip/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve static files AFTER specific routes to avoid conflicts
app.use(express.static(path.join(__dirname, 'public')));

console.log('✅ Static files enabled');

// Removed duplicate error handler

console.log('✅ Enhanced admin and debug endpoints ready');
console.log('✅ Validation middleware ready');  
console.log('✅ Frontend routes ready');

// Global error handlers (AFTER all routes)
app.use((err, req, res, next) => {
  // Log the error
  logMessage('error', '🚨 Unhandled application error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: isDevelopment ? err.message : 'Something went wrong',
    ...(isDevelopment && { stack: err.stack })
  });
});

// 404 handler (MUST be last)
app.use((req, res) => {
  logMessage('warn', '🔍 404 - Route not found', {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  res.status(404).json({
    error: 'Not found',
    message: 'The requested resource was not found'
  });
});

console.log('✅ Global error handlers ready');

// Generate admin token if not set
if (!process.env.ADMIN_TOKEN) {
  const crypto = require('crypto');
  const generatedToken = crypto.randomBytes(32).toString('hex');
  console.log('🔑 Generated Admin Token (add to Railway environment variables):');
  console.log(`ADMIN_TOKEN=${generatedToken}`);
  console.log('⚠️ Save this token - it will not be displayed again!');
}

// Memory monitoring system
let memoryStats = {
  maxHeapUsed: 0,
  maxRSS: 0,
  gcCount: 0,
  lastGC: null,
  warnings: [],
  monitoringStarted: new Date()
};

// Memory monitoring with warnings
function monitorMemory() {
  const usage = process.memoryUsage();
  const heap = usage.heapUsed / 1024 / 1024; // MB
  const rss = usage.rss / 1024 / 1024; // MB
  
  // Update max values
  memoryStats.maxHeapUsed = Math.max(memoryStats.maxHeapUsed, heap);
  memoryStats.maxRSS = Math.max(memoryStats.maxRSS, rss);
  
  // Memory warnings
  const HEAP_WARNING_MB = 100; // Warning at 100MB heap
  const RSS_WARNING_MB = 200;  // Warning at 200MB RSS
  
  if (heap > HEAP_WARNING_MB && !memoryStats.warnings.includes('heap')) {
    memoryStats.warnings.push('heap');
    logMessage('warn', `⚠️ High heap usage: ${heap.toFixed(2)}MB`, {
      heapUsed: heap,
      heapTotal: usage.heapTotal / 1024 / 1024,
      rss: rss,
      external: usage.external / 1024 / 1024
    });
  }
  
  if (rss > RSS_WARNING_MB && !memoryStats.warnings.includes('rss')) {
    memoryStats.warnings.push('rss');
    logMessage('warn', `⚠️ High RSS usage: ${rss.toFixed(2)}MB`, {
      rss: rss,
      heapUsed: heap,
      activeClips: clips.size,
      blockedIPs: blockedIPs.size
    });
  }
  
  // Reset warnings periodically
  if (memoryStats.warnings.length > 0 && Date.now() % 300000 < 5000) { // Every 5 minutes
    memoryStats.warnings = [];
  }
}

// Monitor memory every 30 seconds
const memoryMonitorInterval = setInterval(monitorMemory, 30000);

// GC event tracking (if available)
if (global.gc) {
  const originalGC = global.gc;
  global.gc = function() {
    memoryStats.gcCount++;
    memoryStats.lastGC = new Date();
    const result = originalGC();
    logMessage('debug', '🗑️ Manual garbage collection triggered', {
      gcCount: memoryStats.gcCount,
      memoryAfterGC: process.memoryUsage()
    });
    return result;
  };
}

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Qopy Server (Fixed) running on 0.0.0.0:${PORT}`);
  console.log(`🩺 Health check: http://0.0.0.0:${PORT}/api/health`);
  console.log(`📊 Memory monitoring active`);
  console.log(`✅ All essential features loaded`);
  
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    console.log(`🌐 Public: https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
    console.log(`🩺 Health: https://${process.env.RAILWAY_PUBLIC_DOMAIN}/api/health`);
  }
  
  // Initial memory check
  monitorMemory();
});

// Enhanced server startup with comprehensive error handling
server.on('error', (err) => {
  logMessage('error', '❌ Server startup error', {
    error: err.message,
    code: err.code,
    port: PORT,
    stack: err.stack
  });
  
  if (err.code === 'EADDRINUSE') {
    logMessage('error', `❌ Port ${PORT} is already in use - trying alternative ports`);
    
    // Try alternative ports
    const tryPort = (port) => {
      const alternativeServer = app.listen(port, '0.0.0.0', () => {
        logMessage('info', `🚀 Server started on alternative port ${port}`);
        console.log(`🚀 Qopy Server running on 0.0.0.0:${port}`);
      });
      
      alternativeServer.on('error', (altErr) => {
        if (altErr.code === 'EADDRINUSE' && port < PORT + 10) {
          tryPort(port + 1);
        } else {
          logMessage('error', '❌ Could not start server on any port');
          process.exit(1);
        }
      });
    };
    
    tryPort(PORT + 1);
  } else if (err.code === 'EACCES') {
    logMessage('error', `❌ Permission denied - cannot bind to port ${PORT}`);
    process.exit(1);
  } else {
    logMessage('error', '❌ Unknown server error');
    process.exit(1);
  }
});

// Enhanced server listening event
server.on('listening', () => {
  const addr = server.address();
  logMessage('info', '🎉 Server successfully started', {
    port: addr.port,
    address: addr.address,
    family: addr.family,
    uptime: process.uptime(),
    nodeVersion: process.version,
    pid: process.pid
  });
});

// Connection monitoring
server.on('connection', (socket) => {
  logMessage('debug', '🔌 New connection established', {
    remoteAddress: socket.remoteAddress,
    remotePort: socket.remotePort,
    activeConnections: activeConnections.size
  });
});

// Server close monitoring  
server.on('close', () => {
  logMessage('info', '🔌 Server closed');
  
  // Clean up intervals
  if (memoryMonitorInterval) {
    clearInterval(memoryMonitorInterval);
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
});

// Enhanced Signal handlers with graceful shutdown
const signals = {
  'SIGINT': false,
  'SIGTERM': false,
  'SIGQUIT': false,
  'SIGUSR1': false,
  'SIGUSR2': false
};

let isShuttingDown = false;
const activeConnections = new Set();

// Track connections
server.on('connection', (connection) => {
  activeConnections.add(connection);
  connection.on('close', () => {
    activeConnections.delete(connection);
  });
});

function handleSignal(signal) {
  logMessage('info', `📡 Received ${signal} signal`, { signal });
  signals[signal] = true;
  
  if ((signal === 'SIGTERM' || signal === 'SIGINT') && !isShuttingDown) {
    isShuttingDown = true;
    logMessage('info', '🔄 Initiating graceful shutdown...', { signal });
    gracefulShutdown();
  } else if (signal === 'SIGUSR1') {
    // Reload configuration or restart workers
    logMessage('info', '🔄 Reload signal received - performing soft restart', { signal });
    reloadConfiguration();
  } else if (signal === 'SIGUSR2') {
    // Debug dump signal
    logMessage('info', '🔍 Debug dump signal received', { signal });
    debugDump();
  }
}

function gracefulShutdown() {
  logMessage('info', '🛑 Starting graceful shutdown sequence');
  
  // Stop accepting new connections
  server.close(() => {
    logMessage('info', '🔌 HTTP server closed');
    
    // Close all active connections
    activeConnections.forEach(connection => {
      connection.destroy();
    });
    
    // Final cleanup
    logMessage('info', `✅ All connections closed (${activeConnections.size}). Exiting...`);
    process.exit(0);
  });
  
  // Force shutdown after timeout
  setTimeout(() => {
    logMessage('error', '⏰ Force shutdown after timeout');
    process.exit(1);
  }, 10000);
}

function reloadConfiguration() {
  // Reload external spam lists
  const loadedCount = loadExternalSpamLists();
  logMessage('info', `🔄 Configuration reloaded - ${loadedCount} new IPs loaded`);
}

function debugDump() {
  const dump = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    activeClips: clips.size,
    blockedIPs: blockedIPs.size,
    signals: signals,
    activeConnections: activeConnections.size,
    spamStats: spamStats,
    ipBlockStats: ipBlockStats
  };
  logMessage('debug', `🔍 Debug dump generated`, dump);
}

// Register signal handlers
Object.keys(signals).forEach(signal => {
  process.on(signal, () => handleSignal(signal));
});

// Process error handlers (NOW SAFE TO USE)
process.on('uncaughtException', (error) => {
  logMessage('error', '💥 Uncaught Exception', {
    error: error.message,
    stack: error.stack,
    type: 'uncaughtException'
  });
  
  // Attempt graceful shutdown
  if (!isShuttingDown) {
    gracefulShutdown();
  }
});

process.on('unhandledRejection', (reason, promise) => {
  logMessage('error', '💥 Unhandled Promise Rejection', {
    reason: reason,
    promise: promise,
    type: 'unhandledRejection'
  });
  
  // Don't exit on unhandled rejections in production
  if (process.env.NODE_ENV === 'development') {
    process.exit(1);
  }
});

console.log('✅ Process error handlers ready'); 