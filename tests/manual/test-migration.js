#!/usr/bin/env node

/**
 * Database Migration Test Script
 * 
 * This script tests the automatic database migration functionality
 * before starting the main Qopy server.
 */

const { Pool } = require('pg');
require('dotenv').config();

// Database configuration
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required for testing');
    process.exit(1);
}

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 5,
    min: 1,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

async function testDatabaseMigration() {
    console.log('🧪 Starting Database Migration Test...');
    console.log('🔗 Connecting to database...');
    
    let client;
    try {
        client = await pool.connect();
        console.log('✅ Database connection established');

        // Test 1: Check if all required tables exist
        console.log('\n📋 Test 1: Checking required tables...');
        const requiredTables = ['clips', 'statistics', 'upload_sessions', 'file_chunks', 'upload_statistics'];
        
        for (const tableName of requiredTables) {
            const result = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_name = $1
                );
            `, [tableName]);
            
            if (result.rows[0].exists) {
                console.log(`  ✅ Table '${tableName}' exists`);
            } else {
                console.log(`  ❌ Table '${tableName}' is missing`);
                throw new Error(`Required table '${tableName}' does not exist`);
            }
        }

        // Test 2: Check clips table structure
        console.log('\n🗂️ Test 2: Checking clips table structure...');
        const requiredClipsColumns = [
            'id', 'clip_id', 'password_hash', 'one_time', 'quick_share', 
            'expiration_time', 'access_count', 'created_at', 'accessed_at', 
            'is_expired', 'content_type', 'file_metadata', 'file_path', 
            'original_filename', 'mime_type', 'filesize', 'is_file', 'content'
        ];

        const columnsResult = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'clips' 
            ORDER BY ordinal_position
        `);

        const existingColumns = columnsResult.rows.map(row => row.column_name);
        
        for (const columnName of requiredClipsColumns) {
            if (existingColumns.includes(columnName)) {
                console.log(`  ✅ Column '${columnName}' exists`);
            } else {
                console.log(`  ❌ Column '${columnName}' is missing`);
                throw new Error(`Required column '${columnName}' does not exist in clips table`);
            }
        }

        // Test 3: Check upload_sessions table structure
        console.log('\n📤 Test 3: Checking upload_sessions table structure...');
        const requiredUploadColumns = [
            'id', 'upload_id', 'filename', 'original_filename', 'filesize', 
            'mime_type', 'chunk_size', 'total_chunks', 'uploaded_chunks', 
            'checksums', 'status', 'expiration_time', 'has_password', 
            'one_time', 'quick_share', 'is_text_content',
            'created_at', 'last_activity', 'completed_at'
        ];

        const uploadColumnsResult = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'upload_sessions' 
            ORDER BY ordinal_position
        `);

        const existingUploadColumns = uploadColumnsResult.rows.map(row => row.column_name);
        
        for (const columnName of requiredUploadColumns) {
            if (existingUploadColumns.includes(columnName)) {
                console.log(`  ✅ Column '${columnName}' exists`);
            } else {
                console.log(`  ❌ Column '${columnName}' is missing`);
                throw new Error(`Required column '${columnName}' does not exist in upload_sessions table`);
            }
        }

        // Test 4: Check indexes
        console.log('\n🔗 Test 4: Checking database indexes...');
        const requiredIndexes = [
            'idx_clips_clip_id', 'idx_clips_expiration', 'idx_clips_content_type',
            'idx_upload_sessions_upload_id', 'idx_file_chunks_upload_chunk'
        ];

        for (const indexName of requiredIndexes) {
            const indexResult = await client.query(`
                SELECT EXISTS (
                    SELECT FROM pg_indexes 
                    WHERE schemaname = 'public' AND indexname = $1
                );
            `, [indexName]);
            
            if (indexResult.rows[0].exists) {
                console.log(`  ✅ Index '${indexName}' exists`);
            } else {
                console.log(`  ⚠️ Index '${indexName}' is missing (will be created on startup)`);
            }
        }

        // Test 5: Check foreign key constraints
        console.log('\n🔗 Test 5: Checking foreign key constraints...');
        const constraintResult = await client.query(`
            SELECT constraint_name, table_name, column_name, foreign_table_name, foreign_column_name
            FROM information_schema.key_column_usage 
            JOIN information_schema.referential_constraints ON 
                key_column_usage.constraint_name = referential_constraints.constraint_name
            JOIN information_schema.key_column_usage AS foreign_key_column_usage ON 
                referential_constraints.unique_constraint_name = foreign_key_column_usage.constraint_name
            WHERE key_column_usage.table_name = 'file_chunks'
        `);

        if (constraintResult.rows.length > 0) {
            console.log(`  ✅ Foreign key constraint exists for file_chunks table`);
        } else {
            console.log(`  ⚠️ Foreign key constraint missing (will be created on startup)`);
        }

        // Test 6: Check database functions
        console.log('\n⚙️ Test 6: Checking database functions...');
        const functions = ['cleanup_expired_uploads', 'update_upload_stats'];
        
        for (const functionName of functions) {
            const functionResult = await client.query(`
                SELECT EXISTS (
                    SELECT FROM pg_proc 
                    WHERE proname = $1
                );
            `, [functionName]);
            
            if (functionResult.rows[0].exists) {
                console.log(`  ✅ Function '${functionName}' exists`);
            } else {
                console.log(`  ⚠️ Function '${functionName}' is missing (will be created on startup)`);
            }
        }

        // Test 7: Test basic database operations
        console.log('\n🔄 Test 7: Testing basic database operations...');
        
        // Test statistics table
        const statsResult = await client.query('SELECT COUNT(*) as count FROM statistics');
        console.log(`  ✅ Statistics table accessible (${statsResult.rows[0].count} rows)`);

        // Test upload_statistics table
        const uploadStatsResult = await client.query('SELECT COUNT(*) as count FROM upload_statistics');
        console.log(`  ✅ Upload statistics table accessible (${uploadStatsResult.rows[0].count} rows)`);

        // Test insert operation (dry run)
        const testClipId = 'TEST' + Math.random().toString(36).substring(2, 8).toUpperCase();
        await client.query('BEGIN');
        try {
            await client.query(`
                INSERT INTO clips (clip_id, expiration_time, created_at) 
                VALUES ($1, $2, $3)
            `, [testClipId, Date.now() + 60000, Date.now()]);
            console.log(`  ✅ Insert operation successful (test clip: ${testClipId})`);
            
            // Test select operation
            const selectResult = await client.query('SELECT clip_id FROM clips WHERE clip_id = $1', [testClipId]);
            if (selectResult.rows.length > 0) {
                console.log(`  ✅ Select operation successful`);
            }
            
            await client.query('ROLLBACK'); // Rollback test data
            console.log(`  ✅ Test data rolled back`);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }

        // Test 8: Performance check
        console.log('\n⚡ Test 8: Performance check...');
        const startTime = Date.now();
        await client.query('SELECT 1');
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        if (responseTime < 100) {
            console.log(`  ✅ Database response time: ${responseTime}ms (excellent)`);
        } else if (responseTime < 500) {
            console.log(`  ⚠️ Database response time: ${responseTime}ms (acceptable)`);
        } else {
            console.log(`  ❌ Database response time: ${responseTime}ms (slow)`);
        }

        console.log('\n🎉 All database migration tests completed successfully!');
        console.log('✅ Your PostgreSQL database is properly configured for Qopy');
        console.log('🚀 You can now start the Qopy server with: npm start');

    } catch (error) {
        console.error('\n❌ Database migration test failed:', error.message);
        console.error('\n🔧 Troubleshooting tips:');
        console.error('   1. Make sure PostgreSQL is running');
        console.error('   2. Check DATABASE_URL environment variable');
        console.error('   3. Verify database permissions');
        console.error('   4. Run manual migration: psql $DATABASE_URL -f scripts/database-migration.sql');
        process.exit(1);
    } finally {
        if (client) {
            client.release();
        }
        await pool.end();
    }
}

// Run the test
if (require.main === module) {
    testDatabaseMigration().catch(error => {
        console.error('❌ Test script error:', error);
        process.exit(1);
    });
}

module.exports = { testDatabaseMigration }; 