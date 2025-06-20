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

// In-memory storage for clips
const clips = new Map();

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

// Apply rate limiting to API routes
app.use('/api/clip', createLimiter);

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
const SPAM_SCORE_THRESHOLD = parseInt(process.env.SPAM_SCORE_THRESHOLD) || 25; // Threshold for blocking
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
  /password[\s:=]+\w+/gi, // Password leaks
  /api[_\s]?key[\s:=]+[\w-]+/gi, // API keys
  /token[\s:=]+[\w.-]+/gi, // Tokens
  /(?:https?:\/\/)?bit\.ly\/\w+/gi, // Shortened URLs (often spam)
  /(?:https?:\/\/)?tinyurl\.com\/\w+/gi, // Shortened URLs
  /(?:https?:\/\/)?t\.co\/\w+/gi, // Twitter shortened URLs
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, // Email harvesting pattern
  /\b(?:call|text|whatsapp)[\s:]+\+?\d{10,15}\b/gi, // Phone numbers in suspicious context
  /\$\d+(?:,\d{3})*(?:\.\d{2})?/g, // Money amounts (potential scam)
  /\b(?:bitcoin|btc|ethereum|eth|crypto)[\s:]+[13][a-km-z1-9]{25,34}\b/gi, // Crypto addresses
  /(?:telegram|discord|whatsapp)[\s:@]+\w+/gi, // Social media handles in suspicious context
  /(?:paypal|venmo|cashapp|zelle)[\s:@]+\w+/gi, // Payment app handles
  /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}[A-Z0-9]{1,23}\b/g, // IBAN patterns
  /\b\d{9,18}\b/g, // Bank account numbers
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
  
  // Too many URLs (potential spam)
  const urlMatches = content.match(/https?:\/\/[^\s]+/gi) || [];
  if (urlMatches.length > 5) {
    analysis.isSuspicious = true;
    analysis.reasons.push(`Too many URLs detected: ${urlMatches.length}`);
    analysis.score += 20;
  }
  
  // Excessive repetition
  const uniqueLines = new Set(lines.map(line => line.trim().toLowerCase()));
  if (lines.length > 10 && uniqueLines.size / lines.length < 0.5) {
    analysis.isSuspicious = true;
    analysis.reasons.push('Excessive repetition detected');
    analysis.score += 15;
  }
  
  // Too many uppercase words (SPAM STYLE)
  const uppercaseWords = words.filter(word => word.length > 3 && word === word.toUpperCase());
  if (uppercaseWords.length > words.length * 0.3) {
    analysis.isSuspicious = true;
    analysis.reasons.push('Excessive uppercase text');
    analysis.score += 10;
  }
  
  // Excessive special characters
  const specialChars = content.match(/[!@#$%^&*()_+={}\[\]|\\:";'<>?,./]/g) || [];
  if (specialChars.length > content.length * 0.2) {
    analysis.isSuspicious = true;
    analysis.reasons.push('Excessive special characters');
    analysis.score += 10;
  }
  
  // Suspicious file extensions
  const suspiciousExtensions = content.match(/\.(exe|bat|cmd|scr|pif|com|jar|vbs|js|ps1|sh|dmg|pkg|deb|rpm)\b/gi) || [];
  if (suspiciousExtensions.length > 0) {
    analysis.isSuspicious = true;
    analysis.reasons.push(`Suspicious file extensions: ${suspiciousExtensions.join(', ')}`);
    analysis.score += 25;
  }
  
  // Base64 encoded content (potential malware)
  const base64Pattern = /(?:[A-Za-z0-9+\/]{4})*(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=)?/g;
  const base64Matches = content.match(base64Pattern) || [];
  const longBase64 = base64Matches.filter(match => match.length > 100);
  if (longBase64.length > 0) {
    analysis.isSuspicious = true;
    analysis.reasons.push('Suspicious base64 encoded content detected');
    analysis.score += 20;
  }
  
  // Excessive emoji usage (spam indicator)
  const emojiPattern = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
  const emojiMatches = content.match(emojiPattern) || [];
  if (emojiMatches.length > words.length * 0.3) {
    analysis.isSuspicious = true;
    analysis.reasons.push('Excessive emoji usage');
    analysis.score += 10;
  }
  
  // Suspicious IP addresses
  const ipPattern = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
  const ipMatches = content.match(ipPattern) || [];
  if (ipMatches.length > 2) {
    analysis.isSuspicious = true;
    analysis.reasons.push(`Multiple IP addresses detected: ${ipMatches.length}`);
    analysis.score += 15;
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    activeClips: clips.size,
    timestamp: new Date().toISOString(),
    spamFilter: {
      enabled: SPAM_FILTER_ENABLED,
      threshold: SPAM_SCORE_THRESHOLD,
      stats: {
        totalAnalyzed: spamStats.totalAnalyzed,
        suspicious: spamStats.suspicious,
        blocked: spamStats.blocked,
        blockRate: spamStats.totalAnalyzed > 0 ? (spamStats.blocked / spamStats.totalAnalyzed * 100).toFixed(2) + '%' : '0%',
        suspiciousRate: spamStats.totalAnalyzed > 0 ? (spamStats.suspicious / spamStats.totalAnalyzed * 100).toFixed(2) + '%' : '0%'
      }
    }
  });
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

// Serve the main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

app.listen(PORT, () => {
  console.log(`🚀 Qopy Server running on port ${PORT}`);
  console.log(`📋 Access the app at http://localhost:${PORT}`);
  console.log(`🔐 Security features enabled: Rate limiting, Helmet, CORS`);
  console.log(`🌐 Trust proxy setting: ${app.get('trust proxy')} (NODE_ENV: ${process.env.NODE_ENV})`);
  console.log(`📊 Active clips will be cleaned up every minute`);
}); 