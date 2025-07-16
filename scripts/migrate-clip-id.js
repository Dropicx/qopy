#!/usr/bin/env node

/*
 * Migration Script: Extend clip_id column length
 * 
 * This script migrates the clip_id column from VARCHAR(6) to VARCHAR(10)
 * to support the new 10-character normal clip IDs and 4-character Quick Share IDs.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
}

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function migrateClipIdLength() {
    const client = await pool.connect();
    
    try {
        console.log('🔄 Starting clip_id column migration...');
        
        // Check current column definition
        console.log('📋 Checking current clip_id column definition...');
        const currentDef = await client.query(`
            SELECT column_name, data_type, character_maximum_length 
            FROM information_schema.columns 
            WHERE table_name = 'clips' AND column_name = 'clip_id'
        `);
        
        if (currentDef.rows.length === 0) {
            console.error('❌ clip_id column not found in clips table');
            return;
        }
        
        const currentLength = currentDef.rows[0].character_maximum_length;
        console.log(`📋 Current clip_id length: ${currentLength}`);
        
        if (currentLength >= 10) {
            console.log('✅ clip_id column already supports 10 characters, no migration needed');
            return;
        }
        
        // Perform the migration
        console.log('🔄 Altering clip_id column to VARCHAR(10)...');
        await client.query('ALTER TABLE clips ALTER COLUMN clip_id TYPE VARCHAR(10)');
        
        // Verify the change
        console.log('📋 Verifying migration...');
        const newDef = await client.query(`
            SELECT column_name, data_type, character_maximum_length 
            FROM information_schema.columns 
            WHERE table_name = 'clips' AND column_name = 'clip_id'
        `);
        
        const newLength = newDef.rows[0].character_maximum_length;
        console.log(`📋 New clip_id length: ${newLength}`);
        
        if (newLength >= 10) {
            console.log('✅ Migration successful!');
            
            // Add comment
            await client.query(`
                COMMENT ON COLUMN clips.clip_id IS 'Clip ID: 4 characters for Quick Share, 10 characters for normal clips'
            `);
            console.log('✅ Added column comment');
        } else {
            console.error('❌ Migration failed - column length not updated');
        }
        
    } catch (error) {
        console.error('❌ Migration error:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Run migration
migrateClipIdLength()
    .then(() => {
        console.log('🎉 Migration completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Migration failed:', error);
        process.exit(1);
    }); 