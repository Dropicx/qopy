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

console.log('🔄 Migrating content to binary storage...');

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
    max: 1, // Use single connection for migration
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

async function migrateToBinary() {
    try {
        console.log('🔍 Checking current database schema...');
        
        // Check if content column is already BYTEA
        const schemaCheck = await pool.query(`
            SELECT data_type 
            FROM information_schema.columns 
            WHERE table_name = 'clips' AND column_name = 'content'
        `);
        
        if (schemaCheck.rows.length === 0) {
            console.error('❌ Clips table not found');
            return;
        }
        
        const currentType = schemaCheck.rows[0].data_type;
        console.log(`📋 Current content column type: ${currentType}`);
        
        if (currentType === 'bytea') {
            console.log('✅ Content column is already BYTEA, no migration needed');
            return;
        }
        
        if (currentType !== 'text') {
            console.error(`❌ Unexpected column type: ${currentType}`);
            return;
        }
        
        console.log('🔄 Starting migration from TEXT to BYTEA...');
        
        // Get all clips with text content
        const clips = await pool.query('SELECT id, clip_id, content FROM clips WHERE content IS NOT NULL');
        
        if (clips.rows.length === 0) {
            console.log('✅ No clips found to migrate');
            return;
        }
        
        console.log(`📋 Found ${clips.rows.length} clips to migrate`);
        
        let migratedCount = 0;
        let errorCount = 0;
        
        for (const clip of clips.rows) {
            try {
                // Convert text content to binary
                let binaryContent;
                
                // Check if content is already base64
                if (clip.content.match(/^[A-Za-z0-9+/]*={0,2}$/)) {
                    // Content is base64, convert to binary
                    binaryContent = Buffer.from(clip.content, 'base64');
                } else {
                    // Content is plain text, convert to base64 then binary
                    binaryContent = Buffer.from(clip.content, 'utf8');
                }
                
                // Update the clip with binary content
                await pool.query(
                    'UPDATE clips SET content = $1 WHERE id = $2',
                    [binaryContent, clip.id]
                );
                
                console.log(`✅ Migrated clip ${clip.clip_id}`);
                migratedCount++;
                
            } catch (error) {
                console.error(`❌ Failed to migrate clip ${clip.clip_id}:`, error.message);
                errorCount++;
            }
        }
        
        console.log(`\n📊 Migration Summary:`);
        console.log(`   ✅ Migrated: ${migratedCount} clips`);
        console.log(`   ❌ Errors: ${errorCount} clips`);
        console.log(`   📋 Total processed: ${clips.rows.length}`);
        
        if (migratedCount > 0) {
            console.log('\n🔄 Converting column type to BYTEA...');
            
            // Convert column type to BYTEA
            await pool.query('ALTER TABLE clips ALTER COLUMN content TYPE BYTEA USING content::bytea');
            
            console.log('✅ Column type converted to BYTEA');
            console.log('\n🎉 Migration completed successfully!');
        } else {
            console.log('\nℹ️ No clips needed migration');
        }
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        // Close database connection pool
        await pool.end();
        console.log('🔒 Database connection pool closed');
        process.exit(0);
    }
}

// Run migration
migrateToBinary(); 