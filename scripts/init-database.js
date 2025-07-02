const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Database path configuration
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'qopy.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`📁 Created data directory: ${dataDir}`);
}

console.log('🗄️  Initializing Qopy Database...');
console.log(`📂 Database path: ${DB_PATH}`);

// Create database connection
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to SQLite database');
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Create clips table
const createClipsTable = `
CREATE TABLE IF NOT EXISTS clips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clip_id TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  password_hash TEXT,
  expiration_time INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  accessed_at INTEGER,
  access_count INTEGER DEFAULT 0,
  one_time BOOLEAN DEFAULT 0,
  is_expired BOOLEAN DEFAULT 0,
  created_by_ip TEXT,
  user_agent TEXT
)`;

// Create users table (for future user management)
const createUsersTable = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_login INTEGER,
  is_active BOOLEAN DEFAULT 1,
  is_admin BOOLEAN DEFAULT 0,
  subscription_type TEXT DEFAULT 'free',
  subscription_expires INTEGER
)`;

// Create user_clips table (for linking clips to users)
const createUserClipsTable = `
CREATE TABLE IF NOT EXISTS user_clips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  clip_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (clip_id) REFERENCES clips (clip_id) ON DELETE CASCADE
)`;

// Create access_logs table (for analytics and security)
const createAccessLogsTable = `
CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clip_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  accessed_at INTEGER NOT NULL,
  success BOOLEAN DEFAULT 1,
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
  'CREATE INDEX IF NOT EXISTS idx_access_logs_ip_address ON access_logs(ip_address)',
  'CREATE INDEX IF NOT EXISTS idx_access_logs_accessed_at ON access_logs(accessed_at)'
];

// Execute all table creation statements
const tables = [
  { name: 'clips', sql: createClipsTable },
  { name: 'users', sql: createUsersTable },
  { name: 'user_clips', sql: createUserClipsTable },
  { name: 'access_logs', sql: createAccessLogsTable }
];

let completedTables = 0;
const totalTables = tables.length;

tables.forEach(table => {
  db.run(table.sql, (err) => {
    if (err) {
      console.error(`❌ Error creating ${table.name} table:`, err.message);
    } else {
      console.log(`✅ Created ${table.name} table`);
    }
    completedTables++;
    
    if (completedTables === totalTables) {
      // Create indexes after all tables are created
      createIndexes.forEach((indexSql, index) => {
        db.run(indexSql, (err) => {
          if (err) {
            console.error(`❌ Error creating index ${index + 1}:`, err.message);
          } else {
            console.log(`✅ Created index ${index + 1}`);
          }
          
          if (index === createIndexes.length - 1) {
            console.log('🎉 Database initialization completed successfully!');
            console.log(`📊 Database file: ${DB_PATH}`);
            console.log('📋 Tables created: clips, users, user_clips, access_logs');
            console.log('🔍 Indexes created for optimal performance');
            
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
        });
      });
    }
  });
}); 