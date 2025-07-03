#!/usr/bin/env node

/**
 * Health Check Script for Qopy
 * Tests the health endpoint and basic functionality
 */

const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 3000;
const HOST = process.env.RAILWAY_STATIC_URL ? new URL(process.env.RAILWAY_STATIC_URL).hostname : 'localhost';
const PROTOCOL = process.env.RAILWAY_STATIC_URL ? 'https' : 'http';

console.log(`🔍 Health check for ${PROTOCOL}://${HOST}:${PORT}`);

const client = PROTOCOL === 'https' ? https : http;

const req = client.get(`${PROTOCOL}://${HOST}:${PORT}/health`, (res) => {
  console.log(`📊 Status: ${res.statusCode}`);
  
  if (res.statusCode === 200) {
    console.log('✅ Health check passed');
    process.exit(0);
  } else {
    console.log('❌ Health check failed - unexpected status code');
    process.exit(1);
  }
});

req.on('error', (err) => {
  console.error('❌ Health check failed:', err.message);
  process.exit(1);
});

req.setTimeout(10000, () => {
  console.error('❌ Health check timeout');
  req.destroy();
  process.exit(1);
}); 