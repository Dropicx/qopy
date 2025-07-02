#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Qopy Database Setup');
console.log('=====================\n');

// Check if we're in the right directory
if (!fs.existsSync('package.json')) {
  console.error('❌ Error: package.json not found. Please run this script from the Qopy project root.');
  process.exit(1);
}

// Check Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
if (majorVersion < 18) {
  console.error(`❌ Error: Node.js 18+ required. Current version: ${nodeVersion}`);
  process.exit(1);
}

console.log(`✅ Node.js version: ${nodeVersion}`);

// Check npm version
try {
  const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
  console.log(`✅ npm version: ${npmVersion}`);
} catch (error) {
  console.error('❌ Error: npm not found');
  process.exit(1);
}

// Install dependencies
console.log('\n📦 Installing dependencies...');
try {
  execSync('npm install', { stdio: 'inherit' });
  console.log('✅ Dependencies installed successfully');
} catch (error) {
  console.error('❌ Error installing dependencies');
  process.exit(1);
}

// Create data directory
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('✅ Created data directory');
}

// Initialize database
console.log('\n🗄️ Initializing database...');
try {
  execSync('npm run db:init', { stdio: 'inherit' });
  console.log('✅ Database initialized successfully');
} catch (error) {
  console.error('❌ Error initializing database');
  process.exit(1);
}

// Run migration
console.log('\n🔄 Running database migration...');
try {
  execSync('npm run db:migrate', { stdio: 'inherit' });
  console.log('✅ Database migration completed');
} catch (error) {
  console.error('❌ Error running database migration');
  process.exit(1);
}

// Check if admin token is set
if (!process.env.ADMIN_TOKEN) {
  console.log('\n⚠️  ADMIN_TOKEN not set');
  console.log('   To enable admin dashboard, set the ADMIN_TOKEN environment variable:');
  console.log('   export ADMIN_TOKEN="your-secure-token-here"');
  console.log('   Or run: npm run setup-admin');
}

// Final instructions
console.log('\n🎉 Setup completed successfully!');
console.log('\n📋 Next steps:');
console.log('   1. Set ADMIN_TOKEN environment variable (optional but recommended)');
console.log('   2. Start the server: npm start');
console.log('   3. Access the application: http://localhost:3000');
console.log('   4. Admin dashboard: http://localhost:3000/api/admin/dashboard');
console.log('\n🐳 For Docker deployment:');
console.log('   docker-compose up -d --build');
console.log('\n📚 For more information, see README.md'); 