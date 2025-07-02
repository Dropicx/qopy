const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Database path configuration
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'qopy.db');

console.log('🔄 Qopy Data Migration Tool');
console.log(`📂 Database path: ${DB_PATH}`);

// Check if database exists
if (!fs.existsSync(DB_PATH)) {
  console.log('❌ Database not found. Please run "npm run db:init" first.');
  process.exit(1);
}

// Create database connection
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to SQLite database');
});

// Function to check if clips table has data
function checkExistingData() {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM clips', (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row.count);
      }
    });
  });
}

// Function to migrate sample data (for testing)
function migrateSampleData() {
  const sampleClips = [
    {
      clip_id: 'TEST01',
      content: 'This is a test clip for migration',
      password_hash: null,
      expiration_time: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      created_at: Date.now(),
      accessed_at: null,
      access_count: 0,
      one_time: 0,
      is_expired: 0,
      created_by_ip: '127.0.0.1',
      user_agent: 'Migration Tool'
    },
    {
      clip_id: 'TEST02',
      content: 'Another test clip with password',
      password_hash: '$2b$10$example.hash.for.password',
      expiration_time: Date.now() + (6 * 60 * 60 * 1000), // 6 hours
      created_at: Date.now(),
      accessed_at: null,
      access_count: 0,
      one_time: 1,
      is_expired: 0,
      created_by_ip: '127.0.0.1',
      user_agent: 'Migration Tool'
    }
  ];

  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO clips (
        clip_id, content, password_hash, expiration_time, created_at,
        accessed_at, access_count, one_time, is_expired, created_by_ip, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let completed = 0;
    sampleClips.forEach(clip => {
      stmt.run([
        clip.clip_id,
        clip.content,
        clip.password_hash,
        clip.expiration_time,
        clip.created_at,
        clip.accessed_at,
        clip.access_count,
        clip.one_time,
        clip.is_expired,
        clip.created_by_ip,
        clip.user_agent
      ], (err) => {
        if (err) {
          console.error(`❌ Error inserting clip ${clip.clip_id}:`, err.message);
        } else {
          console.log(`✅ Migrated clip: ${clip.clip_id}`);
        }
        completed++;
        
        if (completed === sampleClips.length) {
          stmt.finalize();
          resolve();
        }
      });
    });
  });
}

// Function to show database statistics
function showDatabaseStats() {
  return new Promise((resolve, reject) => {
    const queries = [
      'SELECT COUNT(*) as total_clips FROM clips',
      'SELECT COUNT(*) as active_clips FROM clips WHERE is_expired = 0',
      'SELECT COUNT(*) as expired_clips FROM clips WHERE is_expired = 1',
      'SELECT COUNT(*) as total_users FROM users',
      'SELECT COUNT(*) as total_logs FROM access_logs'
    ];

    const stats = {};
    let completed = 0;

    queries.forEach((query, index) => {
      db.get(query, (err, row) => {
        if (err) {
          console.error(`❌ Error getting stat ${index + 1}:`, err.message);
        } else {
          const key = Object.keys(row)[0];
          stats[key] = row[key];
        }
        completed++;
        
        if (completed === queries.length) {
          resolve(stats);
        }
      });
    });
  });
}

// Main migration function
async function runMigration() {
  try {
    console.log('📊 Checking existing data...');
    const existingCount = await checkExistingData();
    
    if (existingCount > 0) {
      console.log(`ℹ️  Database already contains ${existingCount} clips`);
      console.log('💡 No migration needed. Database is ready to use.');
    } else {
      console.log('📝 No existing clips found. Adding sample data for testing...');
      await migrateSampleData();
      console.log('✅ Sample data migration completed');
    }

    console.log('\n📈 Database Statistics:');
    const stats = await showDatabaseStats();
    console.log(`   Total clips: ${stats.total_clips}`);
    console.log(`   Active clips: ${stats.active_clips}`);
    console.log(`   Expired clips: ${stats.expired_clips}`);
    console.log(`   Total users: ${stats.total_users}`);
    console.log(`   Access logs: ${stats.total_logs}`);

    console.log('\n🎉 Migration completed successfully!');
    console.log('🚀 Your Qopy application is ready to use with persistent storage.');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    // Close database connection
    db.close((err) => {
      if (err) {
        console.error('❌ Error closing database:', err.message);
      } else {
        console.log('🔒 Database connection closed');
      }
      process.exit(0);
    });
  }
}

// Run migration
runMigration(); 