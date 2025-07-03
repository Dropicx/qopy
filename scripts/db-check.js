#!/usr/bin/env node

const { Pool } = require('pg');

console.log('🔍 Checking PostgreSQL Database Connection...');

// Check if DATABASE_URL is available
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  console.error('   Please add PostgreSQL plugin in Railway dashboard');
  process.exit(1);
}

console.log('✅ DATABASE_URL is available');
console.log(`📂 Database URL: ${DATABASE_URL.replace(/:[^:@]*@/, ':****@')}`);

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

async function checkDatabase() {
  try {
    // Test connection
    const client = await pool.connect();
    console.log('✅ Successfully connected to PostgreSQL database');
    
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
    console.log('🎉 Database check completed successfully!');
    
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('🔒 Database connection closed');
  }
}

checkDatabase(); 