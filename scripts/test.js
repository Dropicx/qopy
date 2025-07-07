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
 */ #!/usr/bin/env node

const http = require('http');
const https = require('https');

const BASE_URL = process.env.RAILWAY_STATIC_URL || 'http://localhost:3000';
const client = BASE_URL.startsWith('https') ? https : http;

console.log('🧪 Qopy Deployment Test Suite');
console.log(`🔗 Testing: ${BASE_URL}`);
console.log('');

// Test functions
async function testHealthCheck() {
  console.log('1️⃣ Testing Health Check...');
  try {
    // Try /api/health first, then fallback to /health
    let response = await makeRequest('/api/health');
    if (response.status === 200) {
      console.log('✅ Health check passed (/api/health)');
      console.log(`   Uptime: ${response.data.uptime}s`);
      console.log(`   Version: ${response.data.version}`);
      return true;
    }
    
    // Fallback to /health
    response = await makeRequest('/health');
    if (response.status === 200) {
      console.log('✅ Health check passed (/health)');
      console.log(`   Uptime: ${response.data.uptime}s`);
      console.log(`   Version: ${response.data.version}`);
      return true;
    } else {
      console.log('❌ Health check failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Health check error:', error.message);
    return false;
  }
}

async function testPing() {
  console.log('2️⃣ Testing Ping...');
  try {
    const response = await makeRequest('/ping');
    if (response.status === 200 && response.data.pong) {
      console.log('✅ Ping successful');
      return true;
    } else {
      console.log('❌ Ping failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Ping error:', error.message);
    return false;
  }
}

async function testMainPage() {
  console.log('3️⃣ Testing Main Page...');
  try {
    const response = await makeRequest('/');
    if (response.status === 200) {
      console.log('✅ Main page loads');
      return true;
    } else {
      console.log('❌ Main page failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Main page error:', error.message);
    return false;
  }
}

async function testDatabaseConnection() {
  console.log('4️⃣ Testing Database Connection...');
  try {
    const response = await makeRequest('/api/clip/ABCDEF/info');
    // We expect a 404 (clip not found), but this means the database is working
    if (response.status === 404) {
      console.log('✅ Database connection working (404 expected for non-existent clip)');
      return true;
    } else if (response.status === 500) {
      console.log('❌ Database connection failed (500 error)');
      return false;
    } else {
      console.log(`⚠️ Unexpected response: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Database test error:', error.message);
    return false;
  }
}

async function testCreateClip() {
  console.log('5️⃣ Testing Clip Creation...');
  try {
    const testData = {
      content: 'Test clip from deployment test',
      expiration: '5min',
      oneTime: false
    };

    const response = await makeRequest('/api/share', 'POST', testData);
    if (response.status === 200 && response.data.success) {
      console.log('✅ Clip creation successful');
      console.log(`   Clip ID: ${response.data.clipId}`);
      console.log(`   URL: ${response.data.url}`);
      return response.data.clipId;
    } else {
      console.log('❌ Clip creation failed');
      return null;
    }
  } catch (error) {
    console.log('❌ Clip creation error:', error.message);
    return null;
  }
}

async function testRetrieveClip(clipId) {
  if (!clipId) {
    console.log('5️⃣ Skipping clip retrieval (no clip created)');
    return false;
  }

  console.log('6️⃣ Testing Clip Retrieval...');
  try {
    const response = await makeRequest(`/api/clip/${clipId}`, 'GET');
    if (response.status === 200 && response.data.success) {
      console.log('✅ Clip retrieval successful');
      console.log(`   Content: ${response.data.content.substring(0, 50)}...`);
      return true;
    } else {
      console.log('❌ Clip retrieval failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Clip retrieval error:', error.message);
    return false;
  }
}

async function testFavicon() {
  console.log('7️⃣ Testing Favicon...');
  try {
    const response = await makeRequest('/favicon.ico');
    if (response.status === 200) {
      console.log('✅ Favicon loads correctly');
      return true;
    } else {
      console.log('❌ Favicon failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Favicon error:', error.message);
    return false;
  }
}

// Helper function to make HTTP requests
function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Qopy-Deployment-Test/1.0'
      }
    };

    if (data) {
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

// Main test runner
async function runTests() {
  console.log('🚀 Starting deployment tests...\n');
  
  const results = {
    healthCheck: await testHealthCheck(),
    ping: await testPing(),
    mainPage: await testMainPage(),
    database: await testDatabaseConnection(),
    favicon: await testFavicon()
  };

  console.log('');
  console.log('📋 Test Results:');
  console.log(`   Health Check: ${results.healthCheck ? '✅' : '❌'}`);
  console.log(`   Ping: ${results.ping ? '✅' : '❌'}`);
  console.log(`   Main Page: ${results.mainPage ? '✅' : '❌'}`);
  console.log(`   Database: ${results.database ? '✅' : '❌'}`);
  console.log(`   Favicon: ${results.favicon ? '✅' : '❌'}`);

  // Only test clip creation if database is working
  if (results.database) {
    const clipId = await testCreateClip();
    if (clipId) {
      await testRetrieveClip(clipId);
    }
  }

  console.log('');
  console.log('🎯 Overall Status:');
  const allPassed = Object.values(results).every(result => result);
  
  if (allPassed) {
    console.log('✅ All basic tests passed! Deployment is working correctly.');
    console.log('🚀 Your Qopy app is ready for production use!');
  } else {
    console.log('⚠️ Some tests failed. Check the logs above for details.');
    console.log('🔧 Review Railway logs: railway logs --tail');
  }

  console.log('');
  console.log('📊 Next Steps:');
  console.log('   1. Test the web interface manually');
  console.log('   2. Create some test clips');
  console.log('   3. Share the app URL with others');
  console.log('   4. Monitor Railway logs for any issues');
}

// Run the tests
runTests().catch(console.error); 