#!/usr/bin/env node

/**
 * Health Check Script for Qopy
 * Tests the health endpoint and basic functionality
 */

const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';
const PROTOCOL = process.env.NODE_ENV === 'production' ? 'https' : 'http';

// Health check function
function healthCheck() {
  const url = `${PROTOCOL}://${HOST}:${PORT}/api/health`;
  const client = PROTOCOL === 'https' ? https : http;
  
  console.log(`🔍 Checking health endpoint: ${url}`);
  
  const req = client.get(url, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      if (res.statusCode === 200) {
        try {
          const result = JSON.parse(data);
          console.log('✅ Health check passed!');
          console.log('📊 Status:', result.status);
          console.log('⏱️  Uptime:', Math.round(result.uptime), 'seconds');
          console.log('📋 Active clips:', result.activeClips);
          console.log('🕐 Timestamp:', result.timestamp);
          process.exit(0);
        } catch (error) {
          console.error('❌ Invalid JSON response:', data);
          process.exit(1);
        }
      } else {
        console.error(`❌ Health check failed with status: ${res.statusCode}`);
        console.error('Response:', data);
        process.exit(1);
      }
    });
  });
  
  req.on('error', (error) => {
    console.error('❌ Health check request failed:', error.message);
    process.exit(1);
  });
  
  req.setTimeout(10000, () => {
    console.error('❌ Health check timeout');
    req.abort();
    process.exit(1);
  });
}

// Run health check
console.log('🚀 Starting Qopy Health Check...');
healthCheck(); 