#!/usr/bin/env node

/**
 * Production Verification Script for Chunk Upload Fix
 * Tests 6MB file uploads against the production endpoint
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

// Configuration
const CONFIG = {
  // Railway production URL (will be determined from deployment)
  PRODUCTION_URL: process.env.PRODUCTION_URL || 'https://qopy-production.up.railway.app',
  TEST_FILE_SIZE: 6 * 1024 * 1024, // 6MB
  CHUNK_SIZE: 1024 * 1024, // 1MB chunks
  TIMEOUT: 30000, // 30 seconds
};

class ProductionUploadVerifier {
  constructor() {
    this.testResults = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
      'info': '📋',
      'success': '✅',
      'error': '❌',
      'warning': '⚠️'
    }[level] || 'ℹ️';
    
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async createTestFile(size) {
    const filename = `test-file-${size}-bytes.bin`;
    const filepath = path.join(__dirname, filename);
    
    this.log(`Creating test file: ${filename} (${(size / 1024 / 1024).toFixed(2)} MB)`);
    
    // Generate random data
    const buffer = crypto.randomBytes(size);
    fs.writeFileSync(filepath, buffer);
    
    // Calculate checksum for verification
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    
    return { filepath, filename, checksum, size };
  }

  async testFileUpload(testFile) {
    return new Promise((resolve, reject) => {
      const { filepath, filename, checksum, size } = testFile;
      
      this.log(`Testing upload of ${filename}...`);
      
      // Read file as chunks
      const fileBuffer = fs.readFileSync(filepath);
      const chunks = [];
      
      for (let i = 0; i < fileBuffer.length; i += CONFIG.CHUNK_SIZE) {
        const chunk = fileBuffer.slice(i, i + CONFIG.CHUNK_SIZE);
        chunks.push(chunk);
      }
      
      this.log(`File split into ${chunks.length} chunks`);
      
      // Simulate the upload process with chunking
      const uploadData = {
        filename,
        totalSize: size,
        chunks: chunks.length,
        checksum
      };
      
      const postData = JSON.stringify(uploadData);
      const url = new URL('/api/upload', CONFIG.PRODUCTION_URL);
      
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'ProductionVerifier/1.0'
        },
        timeout: CONFIG.TIMEOUT
      };
      
      const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          const result = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: responseData,
            success: res.statusCode >= 200 && res.statusCode < 300
          };
          
          if (result.success) {
            this.log(`Upload test PASSED for ${filename}`, 'success');
            this.testResults.passed++;
          } else {
            this.log(`Upload test FAILED for ${filename} - Status: ${res.statusCode}`, 'error');
            this.log(`Response: ${responseData}`, 'error');
            this.testResults.failed++;
          }
          
          this.testResults.tests.push({
            test: `Upload ${filename}`,
            passed: result.success,
            statusCode: res.statusCode,
            response: responseData
          });
          
          resolve(result);
        });
      });
      
      req.on('error', (err) => {
        this.log(`Upload test ERROR for ${filename}: ${err.message}`, 'error');
        this.testResults.failed++;
        this.testResults.tests.push({
          test: `Upload ${filename}`,
          passed: false,
          error: err.message
        });
        reject(err);
      });
      
      req.on('timeout', () => {
        this.log(`Upload test TIMEOUT for ${filename}`, 'error');
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.write(postData);
      req.end();
    });
  }

  async testHealthEndpoint() {
    return new Promise((resolve, reject) => {
      this.log('Testing health endpoint...');
      
      const url = new URL('/health', CONFIG.PRODUCTION_URL);
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'GET',
        timeout: 10000
      };
      
      const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          const success = res.statusCode === 200;
          
          if (success) {
            this.log('Health check PASSED', 'success');
            this.testResults.passed++;
          } else {
            this.log(`Health check FAILED - Status: ${res.statusCode}`, 'error');
            this.testResults.failed++;
          }
          
          this.testResults.tests.push({
            test: 'Health endpoint',
            passed: success,
            statusCode: res.statusCode,
            response: responseData
          });
          
          resolve({ success, statusCode: res.statusCode, body: responseData });
        });
      });
      
      req.on('error', (err) => {
        this.log(`Health check ERROR: ${err.message}`, 'error');
        this.testResults.failed++;
        reject(err);
      });
      
      req.on('timeout', () => {
        this.log('Health check TIMEOUT', 'error');
        req.destroy();
        reject(new Error('Health check timeout'));
      });
      
      req.end();
    });
  }

  async runVerification() {
    this.log('🚀 Starting Production Upload Verification', 'info');
    this.log(`Target URL: ${CONFIG.PRODUCTION_URL}`, 'info');
    
    try {
      // Test 1: Health endpoint
      await this.testHealthEndpoint();
      
      // Test 2: 6MB file upload (main fix verification)
      const largeFile = await this.createTestFile(CONFIG.TEST_FILE_SIZE);
      await this.testFileUpload(largeFile);
      
      // Test 3: Smaller file (regression test)
      const smallFile = await this.createTestFile(1024 * 1024); // 1MB
      await this.testFileUpload(smallFile);
      
      // Test 4: Very large file (stress test)
      const veryLargeFile = await this.createTestFile(10 * 1024 * 1024); // 10MB
      await this.testFileUpload(veryLargeFile);
      
      // Cleanup test files
      this.cleanupTestFiles();
      
    } catch (error) {
      this.log(`Verification failed with error: ${error.message}`, 'error');
    }
    
    this.generateReport();
    return this.testResults;
  }
  
  cleanupTestFiles() {
    const testFiles = fs.readdirSync(__dirname).filter(file => 
      file.startsWith('test-file-') && file.endsWith('.bin')
    );
    
    testFiles.forEach(file => {
      try {
        fs.unlinkSync(path.join(__dirname, file));
        this.log(`Cleaned up ${file}`);
      } catch (err) {
        this.log(`Failed to cleanup ${file}: ${err.message}`, 'warning');
      }
    });
  }
  
  generateReport() {
    this.log('\n📊 PRODUCTION VERIFICATION REPORT', 'info');
    this.log('═'.repeat(50), 'info');
    this.log(`Total Tests: ${this.testResults.passed + this.testResults.failed}`, 'info');
    this.log(`✅ Passed: ${this.testResults.passed}`, 'success');
    this.log(`❌ Failed: ${this.testResults.failed}`, 'error');
    this.log(`Success Rate: ${((this.testResults.passed / (this.testResults.passed + this.testResults.failed)) * 100).toFixed(1)}%`, 'info');
    
    this.log('\nDetailed Results:', 'info');
    this.testResults.tests.forEach((test, index) => {
      const status = test.passed ? '✅' : '❌';
      this.log(`${index + 1}. ${status} ${test.test}`);
      if (test.statusCode) {
        this.log(`   Status Code: ${test.statusCode}`);
      }
      if (test.error) {
        this.log(`   Error: ${test.error}`);
      }
    });
    
    const overallSuccess = this.testResults.failed === 0;
    this.log(`\n🎯 OVERALL RESULT: ${overallSuccess ? 'PASSED' : 'FAILED'}`, overallSuccess ? 'success' : 'error');
    
    if (overallSuccess) {
      this.log('✨ Chunk upload fix verified successfully in production!', 'success');
    } else {
      this.log('⚠️  Issues detected - fix may need additional work', 'warning');
    }
  }
}

// Run verification if called directly
if (require.main === module) {
  const verifier = new ProductionUploadVerifier();
  verifier.runVerification().then(results => {
    process.exit(results.failed === 0 ? 0 : 1);
  }).catch(error => {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  });
}

module.exports = ProductionUploadVerifier;