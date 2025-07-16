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
 *    For proprietary/commercial use. Contact qopy@lit.services
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

const { Pool } = require('pg');

console.log('🗄️ Initializing PostgreSQL Database...');

// PostgreSQL Configuration
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    console.error('   Please add PostgreSQL plugin in Railway dashboard');
    process.exit(1);
}

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

// Create clips table (privacy-first: no IP/user-agent tracking)
const createClipsTable = `
CREATE TABLE IF NOT EXISTS clips (
  id SERIAL PRIMARY KEY,
  clip_id VARCHAR(6) UNIQUE NOT NULL,
  content BYTEA NOT NULL,
  password_hash VARCHAR(60),
  expiration_time BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  accessed_at BIGINT,
  access_count INTEGER DEFAULT 0,
  one_time BOOLEAN DEFAULT FALSE,
  is_expired BOOLEAN DEFAULT FALSE
)`;

// Create users table (for future user management)
const createUsersTable = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(60) NOT NULL,
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

// Create access_logs table (privacy-first: basic stats only, no IP tracking)
const createAccessLogsTable = `
CREATE TABLE IF NOT EXISTS access_logs (
  id SERIAL PRIMARY KEY,
  clip_id VARCHAR(6),
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
                completedTables++;
            } catch (error) {
                console.error(`❌ Error creating ${table.name} table:`, error.message);
            }
        }

        if (completedTables === totalTables) {
            // Create indexes after all tables are created
            for (let i = 0; i < createIndexes.length; i++) {
                try {
                    await pool.query(createIndexes[i]);
                } catch (error) {
                    console.error(`❌ Error creating index ${i + 1}:`, error.message);
                }
            }

            console.log('✅ Database initialization completed successfully');
        } else {
            console.warn(`⚠️ Only ${completedTables}/${totalTables} tables created successfully`);
        }

    } catch (error) {
        console.error('❌ Database initialization failed:', error.message);
    } finally {
        // Close database connection pool
        await pool.end();
        console.log('🔒 Database connection pool closed');
        process.exit(0);
    }
}

// Run initialization
initializeDatabase(); 