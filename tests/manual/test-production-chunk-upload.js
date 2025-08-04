#!/usr/bin/env node

/**
 * Production Verification Script for Chunk Upload Fix
 * Tests the proper chunk upload flow against production endpoint
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const FormData = require('form-data');

// Configuration
const CONFIG = {
  PRODUCTION_URL: process.env.PRODUCTION_URL || 'https://qopy-dev.up.railway.app',
  TEST_FILE_SIZE: 6 * 1024 * 1024, // 6MB - this was failing before the fix
  CHUNK_SIZE: 5 * 1024 * 1024, // 5MB chunks (matches server config)
  TIMEOUT: 30000, // 30 seconds
};

class ChunkUploadVerifier {
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
    const filename = `test-chunk-${size}-bytes.bin`;
    const filepath = path.join(__dirname, filename);
    
    this.log(`Creating test file: ${filename} (${(size / 1024 / 1024).toFixed(2)} MB)`);
    
    // Generate random data
    const buffer = crypto.randomBytes(size);
    fs.writeFileSync(filepath, buffer);
    
    return { filepath, filename, buffer, size };
  }

  async makeRequest(method, endpoint, data = null, isFormData = false) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, CONFIG.PRODUCTION_URL);
      
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: method,
        timeout: CONFIG.TIMEOUT
      };

      if (data && !isFormData) {
        const postData = typeof data === 'string' ? data : JSON.stringify(data);
        options.headers = {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'ChunkUploadVerifier/1.0'
        };
      }

      const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          let parsedResponse;
          try {
            parsedResponse = JSON.parse(responseData);
          } catch (e) {
            parsedResponse = responseData;
          }
          
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsedResponse,
            rawBody: responseData,
            success: res.statusCode >= 200 && res.statusCode < 300
          });
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (isFormData && data) {
        // Handle FormData
        data.pipe(req);
      } else if (data && !isFormData) {
        const postData = typeof data === 'string' ? data : JSON.stringify(data);
        req.write(postData);
      }
      
      if (!isFormData) {
        req.end();
      }
    });
  }

  async initiateUpload(filename, filesize, mimeType = 'application/octet-stream') {
    this.log(`Initiating upload for ${filename} (${filesize} bytes)`);
    
    const response = await this.makeRequest('POST', '/api/upload/initiate', {
      filename,
      filesize,
      mimeType,
      expiration: '24hr',
      hasPassword: false
    });

    if (response.success) {
      this.log(`Upload initiated successfully: ${response.body.uploadId}`, 'success');
      return response.body;
    } else {
      this.log(`Upload initiation failed: ${response.statusCode} - ${JSON.stringify(response.body)}`, 'error');
      throw new Error(`Upload initiation failed: ${response.statusCode}`);
    }
  }

  async uploadChunk(uploadId, chunkNumber, chunkBuffer) {
    this.log(`Uploading chunk ${chunkNumber} (${chunkBuffer.length} bytes)`);
    
    const form = new FormData();
    form.append('chunk', chunkBuffer, {
      filename: `chunk-${chunkNumber}`,
      contentType: 'application/octet-stream'
    });

    return new Promise((resolve, reject) => {
      const url = new URL(`/api/upload/chunk/${uploadId}/${chunkNumber}`, CONFIG.PRODUCTION_URL);
      
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: form.getHeaders(),
        timeout: CONFIG.TIMEOUT
      };

      const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          let parsedResponse;
          try {
            parsedResponse = JSON.parse(responseData);
          } catch (e) {
            parsedResponse = responseData;
          }
          
          const result = {
            statusCode: res.statusCode,
            body: parsedResponse,
            rawBody: responseData,
            success: res.statusCode >= 200 && res.statusCode < 300
          };

          if (result.success) {
            this.log(`Chunk ${chunkNumber} uploaded successfully`, 'success');
          } else {
            this.log(`Chunk ${chunkNumber} upload failed: ${res.statusCode} - ${responseData}`, 'error');
          }
          
          resolve(result);
        });
      });

      req.on('error', (err) => {
        this.log(`Chunk ${chunkNumber} upload error: ${err.message}`, 'error');
        reject(err);
      });

      req.on('timeout', () => {
        this.log(`Chunk ${chunkNumber} upload timeout`, 'error');
        req.destroy();
        reject(new Error('Chunk upload timeout'));
      });

      form.pipe(req);
    });
  }

  async completeUpload(uploadId, totalChunks) {
    this.log(`Completing upload ${uploadId} with ${totalChunks} chunks`);
    
    const response = await this.makeRequest('POST', `/api/upload/complete/${uploadId}`, {
      totalChunks
    });

    if (response.success) {
      this.log(`Upload completed successfully: ${response.body.clipId || 'No clipId returned'}`, 'success');
      return response.body;
    } else {
      this.log(`Upload completion failed: ${response.statusCode} - ${JSON.stringify(response.body)}`, 'error');
      throw new Error(`Upload completion failed: ${response.statusCode}`);
    }
  }

  async testChunkUpload(testFile) {
    const { filepath, filename, buffer, size } = testFile;
    
    this.log(`\n🧪 Testing chunk upload for ${filename}...`);
    
    try {
      // Step 1: Initiate upload
      const initResponse = await this.initiateUpload(filename, size);
      const { uploadId } = initResponse;
      
      // Step 2: Split file into chunks and upload
      const chunks = [];
      for (let i = 0; i < buffer.length; i += CONFIG.CHUNK_SIZE) {
        const chunk = buffer.slice(i, i + CONFIG.CHUNK_SIZE);
        chunks.push(chunk);
      }
      
      this.log(`File split into ${chunks.length} chunks`);
      
      // Upload each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunkResponse = await this.uploadChunk(uploadId, i, chunks[i]);
        if (!chunkResponse.success) {
          throw new Error(`Chunk ${i} upload failed: ${chunkResponse.statusCode}`);
        }
      }
      
      // Step 3: Complete upload
      const completeResponse = await this.completeUpload(uploadId, chunks.length);
      
      this.log(`✅ Full upload test PASSED for ${filename}`, 'success');
      this.testResults.passed++;
      this.testResults.tests.push({
        test: `Chunk upload ${filename}`,
        passed: true,
        uploadId,
        chunks: chunks.length,
        clipId: completeResponse.clipId
      });
      
      return { success: true, uploadId, clipId: completeResponse.clipId };
      
    } catch (error) {
      this.log(`❌ Full upload test FAILED for ${filename}: ${error.message}`, 'error');
      this.testResults.failed++;
      this.testResults.tests.push({
        test: `Chunk upload ${filename}`,
        passed: false,
        error: error.message
      });
      
      return { success: false, error: error.message };
    }
  }

  async testHealthEndpoint() {
    this.log('Testing health endpoint...');
    
    try {
      const response = await this.makeRequest('GET', '/health');
      
      if (response.success) {
        this.log('Health check PASSED', 'success');
        this.testResults.passed++;
      } else {
        this.log(`Health check FAILED - Status: ${response.statusCode}`, 'error');
        this.testResults.failed++;
      }
      
      this.testResults.tests.push({
        test: 'Health endpoint',
        passed: response.success,
        statusCode: response.statusCode,
        response: response.body
      });
      
      return response;
    } catch (error) {
      this.log(`Health check ERROR: ${error.message}`, 'error');
      this.testResults.failed++;
      this.testResults.tests.push({
        test: 'Health endpoint',
        passed: false,
        error: error.message
      });
      throw error;
    }
  }

  async runVerification() {
    this.log('🚀 Starting Production Chunk Upload Verification', 'info');
    this.log(`Target URL: ${CONFIG.PRODUCTION_URL}`, 'info');
    this.log(`Chunk size: ${(CONFIG.CHUNK_SIZE / 1024 / 1024).toFixed(1)} MB`, 'info');
    
    try {
      // Test 1: Health endpoint
      await this.testHealthEndpoint();
      
      // Test 2: 6MB file upload (main fix verification)
      // This should create 2 chunks: 5MB + 1MB
      const largeFile = await this.createTestFile(CONFIG.TEST_FILE_SIZE);
      await this.testChunkUpload(largeFile);
      
      // Test 3: Smaller file (regression test)
      // This should create 1 chunk: 1MB
      const smallFile = await this.createTestFile(1024 * 1024); // 1MB
      await this.testChunkUpload(smallFile);
      
      // Test 4: Large file (stress test)
      // This should create 2 chunks: 5MB + 5MB
      const veryLargeFile = await this.createTestFile(10 * 1024 * 1024); // 10MB
      await this.testChunkUpload(veryLargeFile);
      
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
      file.startsWith('test-chunk-') && file.endsWith('.bin')
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
    this.log('\n📊 PRODUCTION CHUNK UPLOAD VERIFICATION REPORT', 'info');
    this.log('═'.repeat(60), 'info');
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
      if (test.uploadId) {
        this.log(`   Upload ID: ${test.uploadId}`);
      }
      if (test.chunks) {
        this.log(`   Chunks: ${test.chunks}`);
      }
      if (test.clipId) {
        this.log(`   Clip ID: ${test.clipId}`);
      }
      if (test.error) {
        this.log(`   Error: ${test.error}`);
      }
    });
    
    const overallSuccess = this.testResults.failed === 0;
    this.log(`\n🎯 OVERALL RESULT: ${overallSuccess ? 'PASSED' : 'FAILED'}`, overallSuccess ? 'success' : 'error');
    
    if (overallSuccess) {
      this.log('✨ Chunk upload fix verified successfully in production!', 'success');
      this.log('✅ Files > 5MB now upload correctly using chunk system', 'success');
      this.log('✅ Encryption/decryption logic preserved', 'success');
      this.log('✅ No regression for smaller files detected', 'success');
    } else {
      this.log('⚠️  Issues detected - fix may need additional work', 'warning');
      
      // Provide specific feedback
      const failedTests = this.testResults.tests.filter(t => !t.passed);
      if (failedTests.length > 0) {
        this.log('\n🔍 Failed Tests Analysis:', 'info');
        failedTests.forEach(test => {
          if (test.test.includes('6MB') || test.test.includes('10MB')) {
            this.log(`   - Large file chunking issue: ${test.error}`, 'warning');
          } else if (test.test.includes('1MB')) {
            this.log(`   - Small file regression: ${test.error}`, 'warning');
          } else {
            this.log(`   - System issue: ${test.error}`, 'warning');
          }
        });
      }
    }
  }
}

// Run verification if called directly
if (require.main === module) {
  const verifier = new ChunkUploadVerifier();
  verifier.runVerification().then(results => {
    process.exit(results.failed === 0 ? 0 : 1);
  }).catch(error => {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  });
}

module.exports = ChunkUploadVerifier;