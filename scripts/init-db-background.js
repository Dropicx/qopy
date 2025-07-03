#!/usr/bin/env node

const { Pool } = require('pg');

console.log('🗄️ Background database initialization starting...');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not available for background init');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function initializeDatabase() {
  try {
    console.log('🔗 Connecting to PostgreSQL...');
    const client = await pool.connect();
    
    console.log('📋 Creating clips table if not exists...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS clips (
        id SERIAL PRIMARY KEY,
        clip_id VARCHAR(6) UNIQUE NOT NULL,
        content TEXT NOT NULL,
        expiration_time BIGINT NOT NULL,
        password_hash VARCHAR(255),
        one_time BOOLEAN DEFAULT false,
        is_expired BOOLEAN DEFAULT false,
        access_count INTEGER DEFAULT 0,
        created_at BIGINT NOT NULL,
        accessed_at BIGINT,
        ip_address VARCHAR(45),
        user_agent TEXT
      )
    `);

    console.log('📊 Creating access_logs table if not exists...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS access_logs (
        id SERIAL PRIMARY KEY,
        clip_id VARCHAR(6) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        accessed_at BIGINT NOT NULL,
        success BOOLEAN DEFAULT true,
        FOREIGN KEY (clip_id) REFERENCES clips(clip_id) ON DELETE CASCADE
      )
    `);

    console.log('🔍 Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_clips_clip_id ON clips(clip_id);
      CREATE INDEX IF NOT EXISTS idx_clips_expiration ON clips(expiration_time);
      CREATE INDEX IF NOT EXISTS idx_clips_expired ON clips(is_expired);
      CREATE INDEX IF NOT EXISTS idx_access_logs_clip_id ON access_logs(clip_id);
      CREATE INDEX IF NOT EXISTS idx_access_logs_accessed_at ON access_logs(accessed_at);
    `);

    client.release();
    console.log('✅ Database initialization completed successfully');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
  } finally {
    await pool.end();
    console.log('🔌 Database connection pool closed');
  }
}

// Run initialization
initializeDatabase(); 