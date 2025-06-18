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

// In-memory storage for clips
const clips = new Map();

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
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const retrieveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // More lenient for retrieval
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

// Validation middleware
const validateClipCreation = [
  body('content')
    .trim()
    .isLength({ min: 1, max: 100000 })
    .withMessage('Content must be between 1 and 100,000 characters'),
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
  const shareUrl = `${req.protocol}://${req.get('host')}/clip/${clipId}`;
  
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
    timestamp: new Date().toISOString()
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
}); 