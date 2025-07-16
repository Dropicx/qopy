#!/usr/bin/env node

/*
 * Copyright (C) 2025 Qopy App
 * 
 * This file is part of Qopy.
 * 
 * Qopy is dual-licensed:
 * 
 * 1. GNU Affero General Public License v3.0 (AGPL-3.0)
 *    For open source use. See LICENSE-AGPL for details.
 * 
 * 2. Commercial License
 *    For proprietary/commercial use. Contact qopy@lit.services
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

const http = require('http');
const https = require('https');

const BASE_URL = process.env.RAILWAY_STATIC_URL || 'http://localhost:3000';
const client = BASE_URL.startsWith('https') ? https : http;

console.log('📊 Qopy Production Monitor');
console.log(`🔗 Monitoring: ${BASE_URL}`);

let checkCount = 0;
let errorCount = 0;
let lastError = null;

// Configuration
const CHECK_INTERVAL = 60000; // 1 minute
const ERROR_THRESHOLD = 3; // Alert after 3 consecutive errors
const MAX_ERRORS = 10; // Stop monitoring after 10 errors

async function checkHealth() {
  checkCount++;
  const timestamp = new Date().toISOString();
  
  try {
    // Try /api/health first, then fallback to /health
    let response = await makeRequest('/api/health');
    if (response.status !== 200) {
      response = await makeRequest('/health');
    }
    
    if (response.status === 200) {
      const uptime = response.data.uptime;
      
      if (errorCount > 0) {
        console.log(`   🔄 Recovered from ${errorCount} previous errors`);
            }
            
        errorCount = 0;
        lastError = null;
      return true;
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    errorCount++;
    lastError = error.message;
    
    if (errorCount >= ERROR_THRESHOLD) {
      console.log(`🚨 ALERT: ${errorCount} consecutive errors detected!`);
      console.log(`   Last error: ${lastError}`);
      console.log(`   Check Railway logs: railway logs --tail`);
    }
    
    if (errorCount >= MAX_ERRORS) {
      console.log(`🛑 Stopping monitoring after ${MAX_ERRORS} errors`);
      process.exit(1);
    }
    
    return false;
  }
}

async function checkDatabase() {
  try {
    const response = await makeRequest('/api/clip/ABCDEF/info');
    
    if (response.status === 404) {
      // Expected - clip doesn't exist, but database is working
      return true;
    } else if (response.status === 500) {
      throw new Error('Database connection failed');
    } else {
      throw new Error(`Unexpected status: ${response.status}`);
    }
  } catch (error) {
    return false;
  }
}

async function checkMainPage() {
  try {
    const response = await makeRequest('/');
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

async function performAdditionalChecks() {
    let dbOk = false;
    let pageOk = false;
    
    try {
        const dbResponse = await makeRequest('/api/health');
        dbOk = dbResponse.status === 200;
    } catch (error) {
        // Database check failed silently
    }
    
    try {
        const pageResponse = await makeRequest('/');
        pageOk = pageResponse.status === 200;
    } catch (error) {
        // Page check failed silently
    }
    
    if (!dbOk || !pageOk) {
        console.log(`   ⚠️ Additional checks: DB=${dbOk ? '✅' : '❌'}, Page=${pageOk ? '✅' : '❌'}`);
    }
}

async function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      headers: {
        'User-Agent': 'Qopy-Monitor/1.0'
      }
    };

    if (data) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(data));
    }

    const req = client.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsedData = responseData ? JSON.parse(responseData) : {};
          resolve({
            status: res.statusCode,
            data: parsedData,
            headers: res.headers
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            data: responseData,
            headers: res.headers
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function runHealthCheck() {
  const healthOk = await checkHealth();
  
  if (healthOk) {
    // Additional checks only if health is OK
        await performAdditionalChecks();
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Monitoring stopped by user');
  console.log(`📊 Final stats: ${checkCount} checks, ${errorCount} errors`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Monitoring stopped by system');
  console.log(`📊 Final stats: ${checkCount} checks, ${errorCount} errors`);
  process.exit(0);
});

console.log(`⏰ Starting continuous monitoring (${CHECK_INTERVAL/1000}s intervals)`);
console.log(`🚨 Alert threshold: ${ERROR_THRESHOLD} consecutive errors`);
console.log(`🛑 Stop threshold: ${MAX_ERRORS} total errors`);

// Start monitoring
setInterval(runHealthCheck, CHECK_INTERVAL); 
runHealthCheck(); // Initial check 