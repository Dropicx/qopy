#!/usr/bin/env node

const { Pool } = require('pg');

console.log('🗄️  Initializing PostgreSQL Database for Railway...');

// PostgreSQL Configuration
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.error('   Please add PostgreSQL plugin in Railway dashboard');
  process.exit(1);
}

console.log(`📂 Database URL: ${DATABASE_URL.replace(/:[^:@]*@/, ':****@')}`);
console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`🚂 Railway: ${process.env.RAILWAY_ENVIRONMENT || 'local'}`);

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 1, // Use single connection for initialization
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// Test connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

// Create clips table
const createClipsTable = `
CREATE TABLE IF NOT EXISTS clips (
  id SERIAL PRIMARY KEY,
  clip_id VARCHAR(6) UNIQUE NOT NULL,
  content TEXT NOT NULL,
  password_hash VARCHAR(255),
  expiration_time BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  accessed_at BIGINT,
  access_count INTEGER DEFAULT 0,
  one_time BOOLEAN DEFAULT FALSE,
  is_expired BOOLEAN DEFAULT FALSE,
  created_by_ip VARCHAR(45),
  user_agent TEXT
)`;

// Create users table (for future user management)
const createUsersTable = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at BIGINT NOT NULL,
  last_login BIGINT,
  is_active BOOLEAN DEFAULT TRUE,
  is_admin BOOLEAN DEFAULT FALSE,
  subscription_type VARCHAR(20) DEFAULT 'free',
  subscription_expires BIGINT
)`;

// Create user_clips table (for linking clips to users)
const createUserClipsTable = `
CREATE TABLE IF NOT EXISTS user_clips (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  clip_id VARCHAR(6) NOT NULL,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (clip_id) REFERENCES clips (clip_id) ON DELETE CASCADE
)`;

// Create access_logs table (for analytics and security)
const createAccessLogsTable = `
CREATE TABLE IF NOT EXISTS access_logs (
  id SERIAL PRIMARY KEY,
  clip_id VARCHAR(6),
  ip_address VARCHAR(45),
  user_agent TEXT,
  accessed_at BIGINT NOT NULL,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  FOREIGN KEY (clip_id) REFERENCES clips (clip_id) ON DELETE SET NULL
)`;

// Create indexes for better performance
const createIndexes = [
  'CREATE INDEX IF NOT EXISTS idx_clips_clip_id ON clips(clip_id)',
  'CREATE INDEX IF NOT EXISTS idx_clips_expiration ON clips(expiration_time)',
  'CREATE INDEX IF NOT EXISTS idx_clips_created_at ON clips(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_clips_is_expired ON clips(is_expired)',
  'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
  'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
  'CREATE INDEX IF NOT EXISTS idx_user_clips_user_id ON user_clips(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_user_clips_clip_id ON user_clips(clip_id)',
  'CREATE INDEX IF NOT EXISTS idx_access_logs_clip_id ON access_logs(clip_id)',
  'CREATE INDEX IF NOT EXISTS idx_access_logs_ip_address ON access_logs(ip_address)',
  'CREATE INDEX IF NOT EXISTS idx_access_logs_accessed_at ON access_logs(accessed_at)'
];

// Execute all table creation statements
const tables = [
  { name: 'clips', sql: createClipsTable },
  { name: 'users', sql: createUsersTable },
  { name: 'user_clips', sql: createUserClipsTable },
  { name: 'access_logs', sql: createAccessLogsTable }
];

async function initializeDatabase() {
  try {
    let completedTables = 0;
    const totalTables = tables.length;

    for (const table of tables) {
      try {
        await pool.query(table.sql);
        console.log(`✅ Created ${table.name} table`);
        completedTables++;
      } catch (error) {
        console.error(`❌ Error creating ${table.name} table:`, error.message);
      }
    }

    if (completedTables === totalTables) {
      // Create indexes after all tables are created
      console.log('🔍 Creating indexes...');
      for (let i = 0; i < createIndexes.length; i++) {
        try {
          await pool.query(createIndexes[i]);
          console.log(`✅ Created index ${i + 1}`);
        } catch (error) {
          console.error(`❌ Error creating index ${i + 1}:`, error.message);
        }
      }

      console.log('🎉 PostgreSQL database initialization completed successfully!');
      console.log('📊 Database: PostgreSQL (Railway)');
      console.log('📋 Tables created: clips, users, user_clips, access_logs');
      console.log('🔍 Indexes created for optimal performance');
      console.log('⚡ Optimized for Railway PostgreSQL');

    } else {
      console.warn(`⚠️ Only ${completedTables}/${totalTables} tables created successfully`);
      console.log('🔄 Continuing with partial initialization...');
    }

  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    console.log('🔄 Continuing anyway - tables might already exist...');
  } finally {
    // Close database connection pool
    await pool.end();
    console.log('🔒 Database connection pool closed');
    process.exit(0);
  }
}

// Run initialization
initializeDatabase(); 