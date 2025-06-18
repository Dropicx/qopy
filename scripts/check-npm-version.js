#!/usr/bin/env node

/**
 * npm Version Checker for Qopy
 * Ensures that the required npm version is being used during builds
 */

const { execSync } = require('child_process');

const REQUIRED_NPM_VERSION = '11.4.2';

function compareVersions(version1, version2) {
  const v1parts = version1.split('.').map(Number);
  const v2parts = version2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
    const v1part = v1parts[i] || 0;
    const v2part = v2parts[i] || 0;
    
    if (v1part > v2part) return 1;
    if (v1part < v2part) return -1;
  }
  
  return 0;
}

function getCurrentNpmVersion() {
  try {
    const version = execSync('npm --version', { encoding: 'utf8' }).trim();
    return version;
  } catch (error) {
    console.error('❌ Error: Could not determine npm version');
    process.exit(1);
  }
}

function main() {
  console.log('🔍 Checking npm version...');
  
  const currentVersion = getCurrentNpmVersion();
  console.log(`📋 Current npm version: ${currentVersion}`);
  console.log(`📋 Required npm version: >=${REQUIRED_NPM_VERSION}`);
  
  const comparison = compareVersions(currentVersion, REQUIRED_NPM_VERSION);
  
  if (comparison >= 0) {
    console.log('✅ npm version check passed!');
    console.log(`🚀 Using npm ${currentVersion} for build process`);
    
    // Additional npm info for debugging
    try {
      const npmConfig = execSync('npm config get registry', { encoding: 'utf8' }).trim();
      console.log(`📦 npm registry: ${npmConfig}`);
    } catch (error) {
      // Registry check is optional
    }
    
    process.exit(0);
  } else {
    console.error(`❌ Error: npm version ${currentVersion} is too old!`);
    console.error(`⚠️  Please upgrade to npm ${REQUIRED_NPM_VERSION} or higher`);
    console.error('');
    console.error('💡 To upgrade npm, run:');
    console.error('   npm install -g npm@latest');
    console.error('');
    console.error('🔧 Or use a Node.js version manager like nvm:');
    console.error('   nvm install node  # installs latest Node.js with latest npm');
    
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { compareVersions, getCurrentNpmVersion }; 