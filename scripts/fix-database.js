#!/usr/bin/env node

const { Pool } = require('pg');

console.log('🔧 Database Fix Script - Recreating tables with correct schema');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not available');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function fixDatabase() {
  try {
    console.log('🔗 Connecting to PostgreSQL...');
    const client = await pool.connect();
    
    console.log('🗑️ Dropping existing tables...');
    await client.query('DROP TABLE IF EXISTS access_logs CASCADE');
    await client.query('DROP TABLE IF EXISTS clips CASCADE');
    
    console.log('📋 Creating clips table with correct schema...');
    await client.query(`
      CREATE TABLE clips (
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

    console.log('📊 Creating access_logs table...');
    await client.query(`
      CREATE TABLE access_logs (
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
      CREATE INDEX idx_clips_clip_id ON clips(clip_id);
      CREATE INDEX idx_clips_expiration ON clips(expiration_time);
      CREATE INDEX idx_clips_expired ON clips(is_expired);
      CREATE INDEX idx_access_logs_clip_id ON access_logs(clip_id);
      CREATE INDEX idx_access_logs_accessed_at ON access_logs(accessed_at);
    `);

    console.log('✅ Verifying table structure...');
    const clipsColumns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'clips' 
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Clips table columns:');
    clipsColumns.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type}`);
    });

    client.release();
    console.log('✅ Database fix completed successfully');
    
  } catch (error) {
    console.error('❌ Database fix failed:', error.message);
  } finally {
    await pool.end();
    console.log('🔌 Database connection pool closed');
  }
}

// Run fix
fixDatabase(); 