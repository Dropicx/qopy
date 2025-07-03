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
    return execSync('npm --version', { encoding: 'utf8' }).trim();
  } catch (error) {
    console.error('Error: Could not determine npm version');
    process.exit(1);
  }
}

function main() {
  const currentVersion = getCurrentNpmVersion();
  const comparison = compareVersions(currentVersion, REQUIRED_NPM_VERSION);
  
  if (comparison >= 0) {
    process.exit(0);
  } else {
    console.error(`npm version ${currentVersion} is too old. Required: ${REQUIRED_NPM_VERSION}+`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { compareVersions, getCurrentNpmVersion }; 