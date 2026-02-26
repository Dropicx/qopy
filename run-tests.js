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
 *    For proprietary/commercial use. Contact qopy.quiet156@passmail.net
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Test Runner for Qopy Services
 * Runs comprehensive tests with coverage reporting
 */

console.log('🧪 Starting Qopy Service Test Suite');
console.log('=====================================');

// Check if Jest is installed
try {
  execSync('npx jest --version', { stdio: 'ignore' });
} catch (error) {
  console.error('❌ Jest is not installed. Please run: npm install');
  process.exit(1);
}

// Create test results directory
const resultsDir = path.join(__dirname, 'test-results');
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

const testSuites = [
  {
    name: 'Unit Tests - FileService',
    command: 'npx jest tests/unit/services/FileService.test.js --coverage=false --verbose'
  },
  {
    name: 'Unit Tests - QuickShareService',
    command: 'npx jest tests/unit/services/QuickShareService.test.js --coverage=false --verbose'
  },
  {
    name: 'Unit Tests - UploadValidator',
    command: 'npx jest tests/unit/services/UploadValidator.test.js --coverage=false --verbose'
  },
  {
    name: 'Unit Tests - EncryptionService',
    command: 'npx jest tests/unit/services/EncryptionService.test.js --coverage=false --verbose'
  },
  {
    name: 'Unit Tests - StorageService',
    command: 'npx jest tests/unit/services/StorageService.test.js --coverage=false --verbose'
  },
  {
    name: 'Unit Tests - FileAssemblyService',
    command: 'npx jest tests/unit/services/FileAssemblyService.test.js --coverage=false --verbose'
  },
  {
    name: 'Integration Tests',
    command: 'npx jest tests/integration --coverage=false --verbose'
  },
  {
    name: 'Coverage Report',
    command: 'npx jest --coverage --coverageReporters=text --coverageReporters=html'
  }
];

let totalPassed = 0;
let totalFailed = 0;
const results = [];

for (const suite of testSuites) {
  console.log(`\n🔍 Running: ${suite.name}`);
  console.log('-'.repeat(50));
  
  try {
    const output = execSync(suite.command, { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    console.log('✅ PASSED');
    results.push({ name: suite.name, status: 'PASSED', output });
    totalPassed++;
    
    // Extract test counts from Jest output
    const testMatch = output.match(/Tests:\s+(\d+)\s+passed/);
    if (testMatch) {
      console.log(`   Tests passed: ${testMatch[1]}`);
    }
    
  } catch (error) {
    console.log('❌ FAILED');
    results.push({ 
      name: suite.name, 
      status: 'FAILED', 
      output: error.stdout,
      error: error.stderr 
    });
    totalFailed++;
    
    // Show error summary
    const errorLines = error.stdout.split('\n').slice(-10);
    console.log('   Error summary:');
    errorLines.forEach(line => {
      if (line.trim()) {
        console.log(`   ${line}`);
      }
    });
  }
}

// Generate summary report
console.log('\n📊 TEST SUITE SUMMARY');
console.log('=====================');
console.log(`✅ Passed: ${totalPassed}`);
console.log(`❌ Failed: ${totalFailed}`);
console.log(`📈 Success Rate: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);

// Save detailed results
const reportPath = path.join(resultsDir, 'test-report.json');
fs.writeFileSync(reportPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  summary: {
    passed: totalPassed,
    failed: totalFailed,
    successRate: (totalPassed / (totalPassed + totalFailed)) * 100
  },
  results
}, null, 2));

console.log(`\n📄 Detailed report saved to: ${reportPath}`);

// Create HTML summary
const htmlReport = `
<!DOCTYPE html>
<html>
<head>
    <title>Qopy Test Results</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .passed { color: green; }
        .failed { color: red; }
        .suite { margin-bottom: 20px; padding: 10px; border: 1px solid #ccc; }
        .summary { background: #f5f5f5; padding: 15px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <h1>Qopy Service Test Results</h1>
    <div class="summary">
        <h2>Summary</h2>
        <p>Passed: <span class="passed">${totalPassed}</span></p>
        <p>Failed: <span class="failed">${totalFailed}</span></p>
        <p>Success Rate: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%</p>
        <p>Generated: ${new Date().toISOString()}</p>
    </div>
    ${results.map(result => `
        <div class="suite">
            <h3 class="${result.status.toLowerCase()}">${result.name} - ${result.status}</h3>
            <pre>${result.output}</pre>
            ${result.error ? `<pre style="color: red;">${result.error}</pre>` : ''}
        </div>
    `).join('')}
</body>
</html>
`;

const htmlPath = path.join(resultsDir, 'test-report.html');
fs.writeFileSync(htmlPath, htmlReport);
console.log(`📄 HTML report saved to: ${htmlPath}`);

// Exit with appropriate code
process.exit(totalFailed > 0 ? 1 : 0);