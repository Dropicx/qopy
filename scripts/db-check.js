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

console.log('🔍 Checking PostgreSQL Database Connection...');

// PostgreSQL Configuration
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    console.error('   Please add PostgreSQL plugin in Railway dashboard');
    process.exit(1);
}

// Create PostgreSQL connection pool
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 1, // Use single connection for check
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

// Test connection
pool.on('connect', () => {
    console.log('✅ Successfully connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle client', err);
    process.exit(-1);
});

async function checkDatabase() {
    try {
        // Test connection
        const client = await pool.connect();
        
        // Check if tables exist
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        
        console.log('📋 Available tables:');
        if (tablesResult.rows.length === 0) {
            console.log('   No tables found - database is empty');
        } else {
            tablesResult.rows.forEach(row => {
                console.log(`   - ${row.table_name}`);
            });
        }
        
        // Check clips table specifically
        const clipsResult = await client.query(`
            SELECT COUNT(*) as count 
            FROM clips
        `);
        
        console.log(`📊 Clips in database: ${clipsResult.rows[0].count}`);
        
        client.release();
        console.log('✅ Database check completed successfully');
        
    } catch (error) {
        console.error('❌ Database check failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
        console.log('🔒 Database connection closed');
    }
}

checkDatabase(); 