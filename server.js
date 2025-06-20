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

// Trust proxy for Railway deployment (and other reverse proxies)
// This is required for express-rate-limit to work correctly with X-Forwarded-For headers
if (process.env.NODE_ENV === 'production') {
  // In production (Railway), trust the first proxy
  app.set('trust proxy', 1);
} else {
  // In development, trust all proxies (for local testing with proxies)
  app.set('trust proxy', true);
}

// Early health check (before any middleware that might fail) 
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    port: PORT || 3000,
    environment: process.env.NODE_ENV || 'development',
    railway: !!process.env.RAILWAY_ENVIRONMENT,
    ready: true,
    pid: process.pid,
    nodeVersion: process.version
  });
});

// In-memory storage for clips
const clips = new Map();

// IP Blacklist Management
const blockedIPs = new Set([
  // Beispiel-IPs (können Sie durch echte Spam-IPs ersetzen)
  // '192.168.1.100',
  // '10.0.0.50'
]);

// IP-Blockierung Statistiken
let ipBlockStats = {
  totalBlocked: 0,
  lastUpdated: Date.now(),
  sources: []
};

// Externe Spam-IP-Listen laden
function loadExternalSpamLists() {
  const fs = require('fs');
  const path = require('path');
  
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
      console.log('ℹ️ No external spam IP file found. Run spam-ip-updater.js to download lists.');
      return 0;
    }
  } catch (error) {
    console.error('❌ Error loading external spam lists:', error.message);
    return 0;
  }
}

// Beim Server-Start externe Listen laden
setTimeout(() => {
  loadExternalSpamLists();
}, 5000); // 5 Sekunden nach dem Start

// Automatisches Update alle 24 Stunden
setInterval(() => {
  console.log('🔄 Checking for spam IP list updates...');
  loadExternalSpamLists();
}, 24 * 60 * 60 * 1000);

// Funktion zum Hinzufügen einer IP zur Blacklist
function addToBlacklist(ip, reason = 'Manual') {
  if (!blockedIPs.has(ip)) {
    blockedIPs.add(ip);
    ipBlockStats.totalBlocked++;
    
    logMessage('info', `IP ${ip} added to blacklist`, {
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
    
    logMessage('info', `IP ${ip} removed from blacklist`, {
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
    logMessage('warn', `Blocked request from blacklisted IP: ${clientIP}`, {
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

// Spam filter statistics
let spamStats = {
  totalAnalyzed: 0,
  blocked: 0,
  suspicious: 0,
  lastReset: Date.now()
};

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

// Rate limiting
const createLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 20, // Limit each IP to 20 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const retrieveLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_RETRIEVE_REQUESTS) || 100, // More lenient for retrieval
  message: { error: 'Too many retrieval requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply IP blacklist and rate limiting to API routes
app.use('/api/clip', checkBlacklist, createLimiter);
app.use('/api', checkBlacklist); // Schutz für alle API-Routen

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Generate 6-character unique ID (mobile-friendly)
function generateClipId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars: 0,O,1,I,l
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Clean up expired clips
function cleanupExpiredClips() {
  const now = Date.now();
  for (const [id, clip] of clips.entries()) {
    if (clip.expiresAt <= now) {
      clips.delete(id);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredClips, 60000);

// Spam Filter Configuration
const SPAM_FILTER_ENABLED = process.env.SPAM_FILTER_ENABLED !== 'false'; // Default: enabled
const SPAM_SCORE_THRESHOLD = parseInt(process.env.SPAM_SCORE_THRESHOLD) || 50; // Threshold for blocking (increased from 25)
const LOG_SUSPICIOUS_CONTENT = process.env.LOG_SUSPICIOUS_CONTENT !== 'false'; // Default: enabled

// Spam Filter - Content Analysis
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
  // Removed: password patterns (too aggressive for code sharing)
  // Removed: api key patterns (too aggressive for code sharing)
  // Removed: token patterns (too aggressive for code sharing)
  /(?:https?:\/\/)?bit\.ly\/\w+/gi, // Shortened URLs (often spam)
  /(?:https?:\/\/)?tinyurl\.com\/\w+/gi, // Shortened URLs
  /(?:https?:\/\/)?t\.co\/\w+/gi, // Twitter shortened URLs
  // Removed: email patterns (legitimate for contact info)
  /\b(?:call|text|whatsapp)[\s:]+\+?\d{10,15}\b/gi, // Phone numbers in suspicious context
  // Removed: money amounts (too aggressive)
  // Removed: crypto addresses (legitimate use cases)
  // Removed: social media handles (legitimate use cases)
  // Removed: payment app handles (legitimate use cases)
  /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}[A-Z0-9]{1,23}\b/g, // IBAN patterns
  // Removed: bank account numbers (too broad)
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
  
  // Base64 encoded content (potential malware) - only very long strings
  const base64Pattern = /(?:[A-Za-z0-9+\/]{4})*(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=)?/g;
  const base64Matches = content.match(base64Pattern) || [];
  const longBase64 = base64Matches.filter(match => match.length > 500); // Increased threshold
  if (longBase64.length > 0) {
    analysis.isSuspicious = true;
    analysis.reasons.push('Very long base64 encoded content detected');
    analysis.score += 15;
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

// Validation middleware
const MAX_CONTENT_LENGTH = parseInt(process.env.MAX_CONTENT_LENGTH) || 100000;

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

// API Routes

// Create new clip
app.post('/api/clip', validateClipCreation, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  }

  const { content, expiration, oneTime = false, password } = req.body;
  
  // Spam filter analysis
  if (SPAM_FILTER_ENABLED) {
    const spamAnalysis = analyzeContent(content);
    
    // Update statistics
    spamStats.totalAnalyzed++;
    if (spamAnalysis.score > 0) spamStats.suspicious++;
    
    // Log suspicious content if enabled
    if (LOG_SUSPICIOUS_CONTENT && spamAnalysis.score > 0) {
      console.log(`⚠️ Suspicious content detected from IP ${req.ip}:`, {
        score: spamAnalysis.score,
        threshold: SPAM_SCORE_THRESHOLD,
        blocked: spamAnalysis.score >= SPAM_SCORE_THRESHOLD,
        reasons: spamAnalysis.reasons,
        contentPreview: content.substring(0, 100) + '...'
      });
    }
    
    // Block content if score exceeds threshold
    if (spamAnalysis.score >= SPAM_SCORE_THRESHOLD) {
      spamStats.blocked++;
      
      logMessage('warn', `Spam content blocked from IP ${req.ip}`, {
        ip: req.ip,
        score: spamAnalysis.score,
        threshold: SPAM_SCORE_THRESHOLD,
        reasons: spamAnalysis.reasons.slice(0, 3),
        contentPreview: content.substring(0, 100) + '...'
      });
      
      // Bei sehr hohem Spam-Score: IP zur Blacklist hinzufügen
      if (spamAnalysis.score >= SPAM_SCORE_THRESHOLD * 2) {
        addToBlacklist(req.ip, `High spam score: ${spamAnalysis.score}`);
        logMessage('error', `IP ${req.ip} auto-blocked for high spam score`, {
          score: spamAnalysis.score,
          autoBlocked: true
        });
      }
      
      return res.status(403).json({ 
        error: 'Content blocked due to suspicious patterns',
        message: 'Your content contains patterns that are commonly associated with spam or malicious content. Please review and try again.',
        blocked: true,
        score: spamAnalysis.score,
        reasons: spamAnalysis.reasons.slice(0, 3) // Only show first 3 reasons to user
      });
    }
  }
  
  // Calculate expiration time
  const expirationMs = {
    '5min': 5 * 60 * 1000,
    '15min': 15 * 60 * 1000,
    '30min': 30 * 60 * 1000,
    '1hr': 60 * 60 * 1000,
    '6hr': 6 * 60 * 60 * 1000,
    '24hr': 24 * 60 * 60 * 1000
  };

  const clipId = generateClipId();
  const expiresAt = Date.now() + expirationMs[expiration];

  const clip = {
    id: clipId,
    content: content,
    createdAt: Date.now(),
    expiresAt: expiresAt,
    oneTime: oneTime,
    password: password || null,
    accessed: false
  };

  clips.set(clipId, clip);

  // Generate QR code for the sharing URL
  const domain = process.env.DOMAIN || req.get('host');
  const shareUrl = `${req.protocol}://${domain}/clip/${clipId}`;
  
  QRCode.toDataURL(shareUrl, (err, qrCodeUrl) => {
    if (err) {
      console.error('QR Code generation error:', err);
      return res.status(500).json({ error: 'Failed to generate QR code' });
    }

    res.json({
      success: true,
      clipId: clipId,
      shareUrl: shareUrl,
      qrCode: qrCodeUrl,
      expiresAt: expiresAt,
      expiresIn: expirationMs[expiration]
    });
  });
});

// Retrieve clip by ID
app.get('/api/clip/:id', retrieveLimiter, validateClipRetrieval.slice(0, 1), (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid clip ID format' });
  }

  const clipId = req.params.id;
  const clip = clips.get(clipId);
  
  if (!clip) {
    return res.status(404).json({ error: 'Clip not found or expired' });
  }

  // Check if clip has expired
  if (clip.expiresAt <= Date.now()) {
    clips.delete(clipId);
    return res.status(404).json({ error: 'Clip has expired' });
  }

  // If clip has password, require POST method
  if (clip.password) {
    return res.status(401).json({ error: 'Password required' });
  }

  // Check if it's a one-time clip and already accessed
  if (clip.oneTime && clip.accessed) {
    clips.delete(clipId);
    return res.status(404).json({ error: 'This clip has been viewed and destroyed' });
  }

  // Mark as accessed and delete if one-time
  if (clip.oneTime) {
    clip.accessed = true;
    // Delete after sending response
    setTimeout(() => clips.delete(clipId), 100);
  }

  res.json({
    success: true,
    content: clip.content,
    createdAt: clip.createdAt,
    expiresAt: clip.expiresAt,
    oneTime: clip.oneTime
  });
});

// Retrieve clip by ID with password
app.post('/api/clip/:id', retrieveLimiter, validateClipRetrieval, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid clip ID format' });
  }

  const clipId = req.params.id;
  const { password } = req.body;
  
  const clip = clips.get(clipId);
  
  if (!clip) {
    return res.status(404).json({ error: 'Clip not found or expired' });
  }

  // Check if clip has expired
  if (clip.expiresAt <= Date.now()) {
    clips.delete(clipId);
    return res.status(404).json({ error: 'Clip has expired' });
  }

  // Check password if required
  if (clip.password && clip.password !== password) {
    return res.status(401).json({ error: 'Password required or incorrect' });
  }

  // Check if it's a one-time clip and already accessed
  if (clip.oneTime && clip.accessed) {
    clips.delete(clipId);
    return res.status(404).json({ error: 'This clip has been viewed and destroyed' });
  }

  // Mark as accessed and delete if one-time
  if (clip.oneTime) {
    clip.accessed = true;
    // Delete after sending response
    setTimeout(() => clips.delete(clipId), 100);
  }

  res.json({
    success: true,
    content: clip.content,
    createdAt: clip.createdAt,
    expiresAt: clip.expiresAt,
    oneTime: clip.oneTime
  });
});

// Get clip metadata (for password-protected clips)
app.get('/api/clip/:id/info', retrieveLimiter, validateClipRetrieval.slice(0, 1), (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid clip ID format' });
  }

  const clipId = req.params.id;
  const clip = clips.get(clipId);
  
  if (!clip) {
    return res.status(404).json({ error: 'Clip not found or expired' });
  }

  // Check if clip has expired
  if (clip.expiresAt <= Date.now()) {
    clips.delete(clipId);
    return res.status(404).json({ error: 'Clip has expired' });
  }

  res.json({
    success: true,
    hasPassword: !!clip.password,
    oneTime: clip.oneTime,
    expiresAt: clip.expiresAt,
    createdAt: clip.createdAt
  });
});

// Detailed health check endpoint (after all initialization)
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

// Admin Authentication Middleware
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const adminToken = process.env.ADMIN_TOKEN || 'qopy-admin-2024'; // Set via Railway environment variables
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Admin token required. Set Authorization header with Bearer token.'
    });
  }
  
  const token = authHeader.split(' ')[1];
  
  if (token !== adminToken) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid admin token.'
    });
  }
  
  next();
}

// In-memory log storage for Railway
const systemLogs = [];
const MAX_LOGS = 1000; // Keep last 1000 log entries

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
  
  // Keep only last MAX_LOGS entries
  if (systemLogs.length > MAX_LOGS) {
    systemLogs.shift();
  }
  
  // Console log for Railway logs
  const logLine = `[${logEntry.timestamp}] [${level.toUpperCase()}] ${message}`;
  console.log(logLine);
  
  // Additional metadata for Railway
  if (Object.keys(metadata).length > 0) {
    console.log('  Metadata:', JSON.stringify(metadata));
  }
}

// Override console methods to capture logs
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = (...args) => {
  const message = args.join(' ');
  if (!message.includes('[ADMIN]')) { // Avoid infinite recursion
    logMessage('info', message);
  }
  originalConsoleLog.apply(console, args);
};

console.error = (...args) => {
  const message = args.join(' ');
  logMessage('error', message);
  originalConsoleError.apply(console, args);
};

console.warn = (...args) => {
  const message = args.join(' ');
  logMessage('warn', message);
  originalConsoleWarn.apply(console, args);
};

// Admin endpoints for IP management
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

// Admin logs endpoint
app.get('/api/admin/logs', requireAdminAuth, (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const level = req.query.level; // filter by log level
  
  let logs = [...systemLogs];
  
  // Filter by level if specified
  if (level) {
    logs = logs.filter(log => log.level === level);
  }
  
  // Get last N entries
  logs = logs.slice(-limit);
  
  logMessage('info', `[ADMIN] Logs accessed`, { 
    adminIP: req.ip,
    limit: limit,
    level: level || 'all',
    totalLogs: logs.length
  });
  
  res.json({
    success: true,
    logs: logs,
    totalLogs: systemLogs.length,
    filteredLogs: logs.length
  });
});

// Admin system update endpoint
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
    listening: server.listening,
    connections: server._connections || 'unknown',
    maxConnections: server.maxConnections,
    timeout: server.timeout,
    keepAliveTimeout: server.keepAliveTimeout,
    headersTimeout: server.headersTimeout,
    requestTimeout: server.requestTimeout,
    address: server.address(),
    eventNames: server.eventNames(),
    listenerCount: {
      connection: server.listenerCount('connection'),
      request: server.listenerCount('request'),
      close: server.listenerCount('close'),
      error: server.listenerCount('error')
    }
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
    shutdownState: {
      isShuttingDown: isShuttingDown,
      debugMode: DEBUG_MODE,
      shutdownTimeout: SHUTDOWN_TIMEOUT
    },
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
      listening: server.listening,
      connections: server._connections,
      address: server.address()
    },
    application: {
      activeClips: clips.size,
      blockedIPs: blockedIPs.size,
      systemLogs: systemLogs.length,
      spamStats: spamStats,
      ipBlockStats: ipBlockStats
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

// Serve the main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve admin dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve clip retrieval page
app.get('/clip/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Enhanced process monitoring and debugging
const DEBUG_MODE = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';
const SHUTDOWN_TIMEOUT = parseInt(process.env.SHUTDOWN_TIMEOUT) || 30000; // 30 seconds

// Process start logging
logMessage('info', '🚀 Qopy server process started', {
  pid: process.pid,
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch,
  memory: process.memoryUsage(),
  uptime: process.uptime(),
  railwayEnv: process.env.RAILWAY_ENVIRONMENT || 'unknown',
  debugMode: DEBUG_MODE
});

// Memory monitoring
let memoryCheckInterval;
if (DEBUG_MODE) {
  memoryCheckInterval = setInterval(() => {
    const memUsage = process.memoryUsage();
    const memMB = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    };
    
    // Log if memory usage is high
    if (memMB.rss > 400 || memMB.heapUsed > 200) {
      logMessage('warn', '⚠️ High memory usage detected', {
        memory: memMB,
        activeClips: clips.size,
        blockedIPs: blockedIPs.size,
        systemLogs: systemLogs.length
      });
    } else if (DEBUG_MODE) {
      logMessage('info', '📊 Memory check', { memory: memMB });
    }
  }, 60000); // Check every minute
}

// Enhanced graceful shutdown handling
let isShuttingDown = false;
let shutdownTimer;

function initiateShutdown(signal, exitCode = 0) {
  if (isShuttingDown) {
    logMessage('warn', `🔄 Already shutting down, ignoring ${signal}`);
    return;
  }
  
  isShuttingDown = true;
  
  logMessage('info', `🛑 ${signal} received, initiating graceful shutdown...`, {
    signal: signal,
    pid: process.pid,
    uptime: process.uptime(),
    activeClips: clips.size,
    blockedIPs: blockedIPs.size,
    memoryUsage: process.memoryUsage(),
    railwayEnv: process.env.RAILWAY_ENVIRONMENT || 'unknown'
  });

  // Set shutdown timeout
  shutdownTimer = setTimeout(() => {
    logMessage('error', '💥 Forced shutdown after timeout', {
      timeoutMs: SHUTDOWN_TIMEOUT,
      signal: signal
    });
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);

  // Cleanup sequence
  try {
    // Stop memory monitoring
    if (memoryCheckInterval) {
      clearInterval(memoryCheckInterval);
      logMessage('info', '🔄 Stopped memory monitoring');
    }

    // Stop spam list updates
    logMessage('info', '🔄 Stopping background tasks...');

    // Close server gracefully
    if (server && server.listening) {
      logMessage('info', '🔄 Closing HTTP server...');
      server.close((err) => {
        if (err) {
          logMessage('error', '❌ Error closing server', { error: err.message });
        } else {
          logMessage('info', '✅ HTTP server closed successfully');
        }
        
        // Final cleanup
        performFinalCleanup(exitCode);
      });
    } else {
      performFinalCleanup(exitCode);
    }
  } catch (error) {
    logMessage('error', '💥 Error during shutdown sequence', {
      error: error.message,
      stack: error.stack
    });
    performFinalCleanup(1);
  }
}

function performFinalCleanup(exitCode) {
  logMessage('info', '🧹 Performing final cleanup...', {
    exitCode: exitCode,
    totalUptime: process.uptime()
  });

  // Clear shutdown timer
  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
  }

  // Log final statistics
  logMessage('info', '📊 Final server statistics', {
    totalClipsProcessed: spamStats.totalAnalyzed,
    totalSpamBlocked: spamStats.blocked,
    totalIPsBlocked: blockedIPs.size,
    finalMemoryUsage: process.memoryUsage(),
    totalUptime: process.uptime()
  });

  logMessage('info', '👋 Qopy server shutdown complete', {
    exitCode: exitCode,
    timestamp: new Date().toISOString()
  });

  // Small delay to ensure logs are written
  setTimeout(() => {
    process.exit(exitCode);
  }, 100);
}

// Signal handlers with enhanced logging
process.on('SIGTERM', () => {
  logMessage('warn', '📡 SIGTERM signal received', {
    source: 'Railway/Container orchestrator',
    reason: 'Deployment, scaling, or maintenance',
    action: 'Graceful shutdown initiated'
  });
  initiateShutdown('SIGTERM', 0);
});

process.on('SIGINT', () => {
  logMessage('warn', '📡 SIGINT signal received', {
    source: 'User interrupt (Ctrl+C)',
    action: 'Graceful shutdown initiated'
  });
  initiateShutdown('SIGINT', 0);
});

process.on('SIGHUP', () => {
  logMessage('warn', '📡 SIGHUP signal received', {
    source: 'Hangup signal',
    action: 'Graceful restart initiated'
  });
  initiateShutdown('SIGHUP', 0);
});

// Enhanced error handling
process.on('uncaughtException', (err) => {
  logMessage('error', '💥 Uncaught Exception detected', {
    error: err.message,
    stack: err.stack,
    pid: process.pid,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    activeConnections: server ? server._connections : 'unknown'
  });
  
  // Try graceful shutdown first
  initiateShutdown('UNCAUGHT_EXCEPTION', 1);
});

process.on('unhandledRejection', (reason, promise) => {
  logMessage('error', '💥 Unhandled Promise Rejection detected', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: promise.toString(),
    pid: process.pid,
    memory: process.memoryUsage(),
    uptime: process.uptime()
  });
  
  // Log but don't exit immediately for unhandled rejections
  // This allows the application to continue running
});

// Additional debugging signals
if (DEBUG_MODE) {
  process.on('SIGUSR1', () => {
    const debugInfo = {
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      activeClips: clips.size,
      blockedIPs: blockedIPs.size,
      systemLogs: systemLogs.length,
      spamStats: spamStats,
      ipBlockStats: ipBlockStats,
      environment: {
        nodeEnv: process.env.NODE_ENV,
        railwayEnv: process.env.RAILWAY_ENVIRONMENT,
        railwayService: process.env.RAILWAY_SERVICE_NAME,
        railwayRegion: process.env.RAILWAY_REGION
      }
    };
    
    logMessage('info', '🔍 Debug info dump (SIGUSR1)', debugInfo);
  });

  process.on('SIGUSR2', () => {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      logMessage('info', '🗑️ Manual garbage collection triggered', {
        memoryAfterGC: process.memoryUsage()
      });
    } else {
      logMessage('warn', '🗑️ Garbage collection not available (start with --expose-gc)');
    }
  });
}

// Monitor for potential memory leaks
process.on('warning', (warning) => {
  logMessage('warn', '⚠️ Node.js warning detected', {
    name: warning.name,
    message: warning.message,
    stack: warning.stack
  });
});

// Railway-specific monitoring
if (process.env.RAILWAY_ENVIRONMENT) {
  logMessage('info', '🚂 Railway environment detected', {
    environment: process.env.RAILWAY_ENVIRONMENT,
    service: process.env.RAILWAY_SERVICE_NAME,
    region: process.env.RAILWAY_REGION,
    publicDomain: process.env.RAILWAY_PUBLIC_DOMAIN
  });
}

const server = app.listen(PORT, '0.0.0.0', () => {
  // Railway requires binding to 0.0.0.0, not just localhost
  const startupInfo = {
    port: PORT,
    host: '0.0.0.0',
    environment: process.env.NODE_ENV || 'development',
    pid: process.pid,
    nodeVersion: process.version,
    trustProxy: app.get('trust proxy'),
    spamFilterEnabled: SPAM_FILTER_ENABLED,
    spamThreshold: SPAM_SCORE_THRESHOLD,
    rateLimit: {
      maxRequests: process.env.RATE_LIMIT_MAX_REQUESTS || 20,
      windowMs: process.env.RATE_LIMIT_WINDOW_MS || 900000
    },
    memory: process.memoryUsage(),
    railway: {
      environment: process.env.RAILWAY_ENVIRONMENT,
      service: process.env.RAILWAY_SERVICE_NAME,
      region: process.env.RAILWAY_REGION,
      publicDomain: process.env.RAILWAY_PUBLIC_DOMAIN
    },
    debugMode: DEBUG_MODE
  };
  
  logMessage('info', '🚀 Qopy Server successfully started', startupInfo);
  
  // Enhanced console output for Railway debugging
  console.log(`🚀 Qopy Server running on 0.0.0.0:${PORT}`);
  console.log(`📋 Railway Environment: ${process.env.RAILWAY_ENVIRONMENT || 'local'}`);
  console.log(`📋 Health check endpoint: http://localhost:${PORT}/api/health`);
  console.log(`🔐 Security features enabled: Rate limiting, Helmet, CORS`);
  console.log(`🌐 Trust proxy setting: ${app.get('trust proxy')} (NODE_ENV: ${process.env.NODE_ENV})`);
  console.log(`📊 Active clips will be cleaned up every minute`);
  console.log(`🛡️ Spam filter enabled: ${SPAM_FILTER_ENABLED}`);
  console.log(`🎛️ Admin dashboard: http://localhost:${PORT}/admin`);
  console.log(`🔍 Debug mode: ${DEBUG_MODE ? 'ENABLED' : 'DISABLED'}`);
  
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    console.log(`🌐 Public URL: https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
    console.log(`🎛️ Admin URL: https://${process.env.RAILWAY_PUBLIC_DOMAIN}/admin`);
    console.log(`🏥 Health check: https://${process.env.RAILWAY_PUBLIC_DOMAIN}/api/health`);
  }
  
  // Force log the health endpoint for debugging
  console.log(`🩺 Health endpoint available at: http://0.0.0.0:${PORT}/api/health`);
});

server.on('error', (err) => {
  const errorInfo = {
    error: err.message,
    code: err.code,
    port: PORT,
    pid: process.pid,
    stack: err.stack
  };
  
  if (err.code === 'EADDRINUSE') {
    logMessage('error', `❌ Port ${PORT} is already in use`, errorInfo);
    console.error(`❌ Port ${PORT} is already in use`);
    process.exit(1);
  } else {
    logMessage('error', '❌ Server startup error', errorInfo);
    console.error('❌ Server error:', err);
    process.exit(1);
  }
});

// Server connection monitoring
server.on('connection', (socket) => {
  if (DEBUG_MODE) {
    logMessage('info', '🔗 New connection established', {
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort,
      connections: server._connections || 'unknown'
    });
  }
});

server.on('close', () => {
  logMessage('info', '🔌 Server closed', {
    uptime: process.uptime(),
    finalStats: {
      totalClips: spamStats.totalAnalyzed,
      blockedSpam: spamStats.blocked,
      blockedIPs: blockedIPs.size
    }
  });
}); 