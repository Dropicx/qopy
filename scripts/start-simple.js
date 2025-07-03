#!/usr/bin/env node

console.log('🚀 Starting Qopy Server (Simple Mode)...');
console.log('📋 Environment:', process.env.NODE_ENV || 'development');
console.log('🚂 Railway:', process.env.RAILWAY_ENVIRONMENT || 'local');

// Check if DATABASE_URL is available
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.error('   Please add PostgreSQL plugin in Railway dashboard');
  process.exit(1);
}

console.log('✅ DATABASE_URL is available');

// Initialize database first
console.log('🗄️ Initializing PostgreSQL database...');
const { execSync } = require('child_process');

try {
  execSync('node scripts/init-postgres.js', { 
    stdio: 'inherit',
    env: process.env 
  });
  console.log('✅ Database initialization completed');
} catch (error) {
  console.error('❌ Database initialization failed:', error.message);
  console.log('🔄 Continuing anyway...');
}

// Start the simple server
console.log('🚀 Starting simple server...');
try {
  execSync('node server-postgres-simple.js', { 
    stdio: 'inherit',
    env: process.env 
  });
} catch (error) {
  console.error('❌ Server failed:', error.message);
  process.exit(1);
} 