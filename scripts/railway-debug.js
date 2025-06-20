#!/usr/bin/env node

// Railway Debug Script
// Monitors server behavior and Railway environment

const http = require('http');

const SERVER_URL = process.env.RAILWAY_PUBLIC_DOMAIN 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'http://localhost:8080';

console.log('🔍 Railway Debug Monitor Starting...');
console.log(`📍 Target: ${SERVER_URL}`);

// Test health endpoint
async function testHealth() {
  return new Promise((resolve, reject) => {
    const url = `${SERVER_URL}/api/health`;
    console.log(`🩺 Testing health check: ${url}`);
    
    const lib = url.startsWith('https') ? require('https') : require('http');
    
    lib.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          console.log('✅ Health check successful:', parsed);
          resolve(parsed);
        } catch (err) {
          console.log('⚠️ Health check returned non-JSON:', data);
          resolve({ status: 'NON_JSON', data });
        }
      });
    }).on('error', (err) => {
      console.log('❌ Health check failed:', err.message);
      reject(err);
    });
  });
}

// Test ping endpoint
async function testPing() {
  return new Promise((resolve, reject) => {
    const url = `${SERVER_URL}/api/ping`;
    console.log(`🏓 Testing ping: ${url}`);
    
    const lib = url.startsWith('https') ? require('https') : require('http');
    
    lib.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          console.log('✅ Ping successful:', parsed);
          resolve(parsed);
        } catch (err) {
          console.log('⚠️ Ping returned non-JSON:', data);
          resolve({ status: 'NON_JSON', data });
        }
      });
    }).on('error', (err) => {
      console.log('❌ Ping failed:', err.message);
      reject(err);
    });
  });
}

// Monitor loop
async function monitor() {
  console.log('🔄 Starting monitoring loop...');
  
  let consecutiveFailures = 0;
  let iteration = 0;
  
  while (true) {
    iteration++;
    console.log(`\n--- Monitor Iteration #${iteration} ---`);
    console.log(`⏰ Time: ${new Date().toISOString()}`);
    
    try {
      // Test health
      const health = await testHealth();
      
      // Test ping
      const ping = await testPing();
      
      consecutiveFailures = 0;
      console.log(`✅ Iteration ${iteration} successful`);
      
    } catch (error) {
      consecutiveFailures++;
      console.log(`❌ Iteration ${iteration} failed (${consecutiveFailures} consecutive failures)`);
      
      if (consecutiveFailures >= 3) {
        console.log('🚨 Server appears to be down - 3 consecutive failures');
        break;
      }
    }
    
    // Wait 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  
  console.log('🔴 Monitoring stopped due to persistent failures');
}

// Environment info
console.log('\n📋 Environment Information:');
console.log(`  Node Version: ${process.version}`);
console.log(`  Platform: ${process.platform}`);
console.log(`  Architecture: ${process.arch}`);
console.log(`  PID: ${process.pid}`);
console.log(`  Memory: ${JSON.stringify(process.memoryUsage())}`);

if (process.env.RAILWAY_ENVIRONMENT) {
  console.log('\n🚂 Railway Environment:');
  console.log(`  Environment: ${process.env.RAILWAY_ENVIRONMENT}`);
  console.log(`  Service: ${process.env.RAILWAY_SERVICE_NAME}`);
  console.log(`  Region: ${process.env.RAILWAY_REGION}`);
  console.log(`  Public Domain: ${process.env.RAILWAY_PUBLIC_DOMAIN}`);
}

// Start monitoring if this is run directly
if (require.main === module) {
  monitor().catch(console.error);
}

module.exports = { testHealth, testPing, monitor }; 