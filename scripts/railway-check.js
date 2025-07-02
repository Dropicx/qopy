#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Railway Deployment Check');
console.log('==========================\n');

let allChecksPassed = true;

// Check 1: Required files exist
console.log('📁 Checking required files...');
const requiredFiles = [
  'server-postgres.js',
  'scripts/init-postgres.js',
  'package.json',
  'railway.toml',
  'public/index.html'
];

requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - MISSING`);
    allChecksPassed = false;
  }
});

// Check 2: Package.json dependencies
console.log('\n📦 Checking package.json...');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  
  // Check required dependencies
  const requiredDeps = ['express', 'pg', 'helmet', 'cors', 'compression'];
  requiredDeps.forEach(dep => {
    if (packageJson.dependencies && packageJson.dependencies[dep]) {
      console.log(`✅ ${dep}: ${packageJson.dependencies[dep]}`);
    } else {
      console.log(`❌ ${dep} - MISSING`);
      allChecksPassed = false;
    }
  });
  
  // Check main entry point
  if (packageJson.main === 'server-postgres.js') {
    console.log('✅ Main entry point: server-postgres.js');
  } else {
    console.log(`❌ Main entry point should be server-postgres.js, got: ${packageJson.main}`);
    allChecksPassed = false;
  }
  
  // Check start script
  if (packageJson.scripts && packageJson.scripts.start && packageJson.scripts.start.includes('server-postgres.js')) {
    console.log('✅ Start script: server-postgres.js');
  } else {
    console.log('❌ Start script should use server-postgres.js');
    allChecksPassed = false;
  }
  
} catch (error) {
  console.log(`❌ Error reading package.json: ${error.message}`);
  allChecksPassed = false;
}

// Check 3: Railway configuration
console.log('\n🚂 Checking Railway configuration...');
try {
  const railwayConfig = fs.readFileSync('railway.toml', 'utf8');
  
  if (railwayConfig.includes('server-postgres.js')) {
    console.log('✅ Start command: server-postgres.js');
  } else {
    console.log('❌ Start command should use server-postgres.js');
    allChecksPassed = false;
  }
  
  if (railwayConfig.includes('init-postgres.js')) {
    console.log('✅ Database initialization: init-postgres.js');
  } else {
    console.log('❌ Database initialization should use init-postgres.js');
    allChecksPassed = false;
  }
  
  if (railwayConfig.includes('/api/health')) {
    console.log('✅ Health check: /api/health');
  } else {
    console.log('❌ Health check should be /api/health');
    allChecksPassed = false;
  }
  
} catch (error) {
  console.log(`❌ Error reading railway.toml: ${error.message}`);
  allChecksPassed = false;
}

// Check 4: Environment variables
console.log('\n🔧 Checking environment variables...');
const requiredEnvVars = ['DATABASE_URL'];
const optionalEnvVars = ['ADMIN_TOKEN', 'NODE_ENV', 'RAILWAY_ENVIRONMENT'];

requiredEnvVars.forEach(envVar => {
  if (process.env[envVar]) {
    console.log(`✅ ${envVar}: Set`);
  } else {
    console.log(`⚠️ ${envVar}: Not set (will be provided by Railway PostgreSQL plugin)`);
  }
});

optionalEnvVars.forEach(envVar => {
  if (process.env[envVar]) {
    console.log(`✅ ${envVar}: ${process.env[envVar]}`);
  } else {
    console.log(`ℹ️ ${envVar}: Not set (optional)`);
  }
});

// Check 5: Node.js version
console.log('\n🟢 Checking Node.js version...');
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
if (majorVersion >= 18) {
  console.log(`✅ Node.js ${nodeVersion} (>= 18.0.0 required)`);
} else {
  console.log(`❌ Node.js ${nodeVersion} (>= 18.0.0 required)`);
  allChecksPassed = false;
}

// Check 6: NPM version
console.log('\n📦 Checking npm version...');
try {
  const { execSync } = require('child_process');
  const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
  const npmMajor = parseInt(npmVersion.split('.')[0]);
  if (npmMajor >= 10) {
    console.log(`✅ npm ${npmVersion} (>= 10.0.0 required)`);
  } else {
    console.log(`❌ npm ${npmVersion} (>= 10.0.0 required)`);
    allChecksPassed = false;
  }
} catch (error) {
  console.log(`❌ Error checking npm version: ${error.message}`);
  allChecksPassed = false;
}

// Final result
console.log('\n' + '='.repeat(50));
if (allChecksPassed) {
  console.log('🎉 All checks passed! Ready for Railway deployment.');
  console.log('\n📋 Next steps:');
  console.log('   1. Add PostgreSQL plugin in Railway dashboard');
  console.log('   2. Set ADMIN_TOKEN environment variable');
  console.log('   3. Deploy to Railway');
  console.log('   4. Check logs for database initialization');
} else {
  console.log('❌ Some checks failed. Please fix the issues above.');
  console.log('\n🔧 Common fixes:');
  console.log('   - Ensure all required files exist');
  console.log('   - Check package.json dependencies');
  console.log('   - Verify railway.toml configuration');
  console.log('   - Update Node.js/npm versions if needed');
}
console.log('='.repeat(50));

process.exit(allChecksPassed ? 0 : 1); 