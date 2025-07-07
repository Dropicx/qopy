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
const bcrypt = require('bcrypt');

console.log('🔐 Starting password migration...');

// PostgreSQL Configuration
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// Password hashing function
async function hashPassword(password) {
  if (!password) return null;
  const saltRounds = 12;
  try {
    return await bcrypt.hash(password, saltRounds);
  } catch (error) {
    console.error('❌ Error hashing password:', error.message);
    throw new Error('Failed to hash password');
  }
}

// Check if password is already hashed (bcrypt hashes start with $2b$)
function isAlreadyHashed(password) {
  return password && password.startsWith('$2b$');
}

async function migratePasswords() {
  try {
    console.log('🔍 Checking for plaintext passwords...');
    
    // Get all clips with passwords
    const result = await pool.query(`
      SELECT clip_id, password_hash 
      FROM clips 
      WHERE password_hash IS NOT NULL 
      AND password_hash != ''
    `);
    
    if (result.rows.length === 0) {
      console.log('✅ No passwords found to migrate');
      return;
    }
    
    console.log(`📋 Found ${result.rows.length} clips with passwords`);
    
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const row of result.rows) {
      const { clip_id, password_hash } = row;
      
      // Check if password is already hashed
      if (isAlreadyHashed(password_hash)) {
        console.log(`⏭️ Skipping ${clip_id} - already hashed`);
        skippedCount++;
        continue;
      }
      
      try {
        // Hash the plaintext password
        const hashedPassword = await hashPassword(password_hash);
        
        // Update the database
        await pool.query(
          'UPDATE clips SET password_hash = $1 WHERE clip_id = $2',
          [hashedPassword, clip_id]
        );
        
        console.log(`✅ Migrated password for clip ${clip_id}`);
        migratedCount++;
        
      } catch (error) {
        console.error(`❌ Failed to migrate password for clip ${clip_id}:`, error.message);
      }
    }
    
    console.log(`\n📊 Migration Summary:`);
    console.log(`   ✅ Migrated: ${migratedCount} passwords`);
    console.log(`   ⏭️ Skipped: ${skippedCount} (already hashed)`);
    console.log(`   📋 Total processed: ${result.rows.length}`);
    
    if (migratedCount > 0) {
      console.log('\n🎉 Password migration completed successfully!');
    } else {
      console.log('\nℹ️ No passwords needed migration');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('🔒 Database connection closed');
  }
}

// Run migration
migratePasswords(); 