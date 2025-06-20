const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 Progressive Qopy Server starting...');
console.log(`📋 Port: ${PORT}`);
console.log(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`📋 Railway: ${process.env.RAILWAY_ENVIRONMENT || 'local'}`);

// Trust proxy (Railway requirement)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
} else {
  app.set('trust proxy', true);
}

// Early health check (same as minimal)
app.get('/api/health', (req, res) => {
  console.log('🩺 Health check requested');
  res.status(200).json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    railway: !!process.env.RAILWAY_ENVIRONMENT,
    version: 'progressive-1.0.0'
  });
});

// Progressive feature additions

// STEP 1: Basic storage
const clips = new Map();
console.log('✅ Step 1: Basic storage initialized');

// STEP 2: Basic middleware (helmet, cors, compression)
try {
  const helmet = require('helmet');
  const cors = require('cors');
  const compression = require('compression');
  
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
  console.log('✅ Step 2: Security middleware loaded');
} catch (error) {
  console.error('❌ Step 2 failed:', error.message);
}

// STEP 3: JSON parsing
try {
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  console.log('✅ Step 3: JSON parsing enabled');
} catch (error) {
  console.error('❌ Step 3 failed:', error.message);
}

// STEP 4: Static files
try {
  app.use(express.static(path.join(__dirname, 'public')));
  console.log('✅ Step 4: Static files enabled');
} catch (error) {
  console.error('❌ Step 4 failed:', error.message);
}

// STEP 5: Rate limiting
try {
  const rateLimit = require('express-rate-limit');
  
  const createLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  
  // Apply only to specific routes for now
  app.use('/api/clip', createLimiter);
  console.log('✅ Step 5: Rate limiting enabled');
} catch (error) {
  console.error('❌ Step 5 failed:', error.message);
}

// STEP 6: Simple logging function
function simpleLog(level, message, metadata = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
  if (Object.keys(metadata).length > 0) {
    console.log('  Metadata:', JSON.stringify(metadata));
  }
}
console.log('✅ Step 6: Logging function ready');

// STEP 7: Basic routes
app.get('/', (req, res) => {
  res.json({
    message: 'Progressive Qopy Server is running',
    status: 'OK',
    timestamp: new Date().toISOString(),
    features: 'progressive-loading'
  });
});

// Test clip creation (simplified)
app.post('/api/clip', (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }
    
    const id = Math.random().toString(36).substr(2, 6).toUpperCase();
    const clip = {
      id,
      content,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h
    };
    
    clips.set(id, clip);
    simpleLog('info', `Clip created: ${id}`);
    
    res.json({
      success: true,
      id,
      url: `${req.protocol}://${req.get('host')}/${id}`,
      expiresAt: clip.expiresAt
    });
  } catch (error) {
    console.error('❌ Clip creation failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

console.log('✅ Step 7: Basic routes enabled');

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Progressive Qopy Server running on 0.0.0.0:${PORT}`);
  console.log(`🩺 Health check: http://0.0.0.0:${PORT}/api/health`);
  console.log(`✅ All steps completed successfully`);
  
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