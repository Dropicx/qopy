# Qopy Database Migration Guide

After merging `dev` into `main`, comprehensive file-sharing features have been added. This guide provides instructions for proper database migration.

## New Features Overview

### File-Sharing Capabilities
- **Multi-Part Upload System** - Efficient uploading of large files in chunks
- **Encrypted File Storage** - Client-side encryption before upload
- **Download Token System** - Secure authentication for file downloads
- **Enhanced Clip Management** - Support for both text and file content

### New Database Tables
- `upload_sessions` - Management of multi-part uploads
- `file_chunks` - Temporary storage of upload chunks
- `upload_statistics` - Monitoring and statistics
- Extended `clips` table with file metadata

## Automatic Migration

**Migration runs automatically on server startup.** No manual execution required.

```bash
# Simply start the server
npm start
```

The migration automatically creates:
- All necessary tables
- Indexes for improved performance
- Foreign key constraints
- Database functions and triggers
- Schema integrity validation

## Testing Migration

Before initial startup, you can test the migration:

```bash
# Test migration (optional)
npm run test-migration

# Expected output:
# Starting Database Migration Test...
# Database connection established
# Test 1: Checking required tables...
#   Table 'clips' exists
#   Table 'statistics' exists
#   Table 'upload_sessions' exists
#   Table 'file_chunks' exists
#   Table 'upload_statistics' exists
# All database migration tests completed successfully!
```

## Manual Migration (if required)

If automatic migration fails:

```bash
# Execute manual migration
npm run migrate

# Or directly with psql
psql $DATABASE_URL -f scripts/database-migration.sql
```

## Database Schema Overview

### clips (Extended)
```sql
CREATE TABLE clips (
    id SERIAL PRIMARY KEY,
    clip_id VARCHAR(10) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    one_time BOOLEAN DEFAULT false,
    quick_share BOOLEAN DEFAULT false,
    expiration_time BIGINT NOT NULL,
    access_count INTEGER DEFAULT 0,
    created_at BIGINT NOT NULL,
    accessed_at BIGINT,
    is_expired BOOLEAN DEFAULT false,
    
    -- New file support columns
    content_type VARCHAR(20) DEFAULT 'text',
    file_metadata JSONB,
    file_path VARCHAR(500),
    original_filename VARCHAR(255),
    mime_type VARCHAR(100),
    filesize BIGINT,
    is_file BOOLEAN DEFAULT false,
    content BYTEA
);
```

### upload_sessions (New)
```sql
CREATE TABLE upload_sessions (
    id SERIAL PRIMARY KEY,
    upload_id VARCHAR(50) UNIQUE NOT NULL,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    filesize BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    chunk_size INTEGER NOT NULL DEFAULT 5242880,
    total_chunks INTEGER NOT NULL,
    uploaded_chunks INTEGER DEFAULT 0,
    checksums TEXT[],
    status VARCHAR(20) DEFAULT 'uploading',
    expiration_time BIGINT NOT NULL,
    has_password BOOLEAN DEFAULT false,
    one_time BOOLEAN DEFAULT false,
    quick_share BOOLEAN DEFAULT false,
    is_text_content BOOLEAN DEFAULT false,
    client_ip VARCHAR(45),
    created_at BIGINT NOT NULL,
    last_activity BIGINT NOT NULL,
    completed_at BIGINT
);
```

### file_chunks (New)
```sql
CREATE TABLE file_chunks (
    id SERIAL PRIMARY KEY,
    upload_id VARCHAR(50) NOT NULL,
    chunk_number INTEGER NOT NULL,
    chunk_size INTEGER NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    created_at BIGINT NOT NULL,
    UNIQUE(upload_id, chunk_number),
    FOREIGN KEY (upload_id) REFERENCES upload_sessions(upload_id) ON DELETE CASCADE
);
```

### upload_statistics (New)
```sql
CREATE TABLE upload_statistics (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    total_uploads INTEGER DEFAULT 0,
    total_file_size BIGINT DEFAULT 0,
    completed_uploads INTEGER DEFAULT 0,
    failed_uploads INTEGER DEFAULT 0,
    text_clips INTEGER DEFAULT 0,
    file_clips INTEGER DEFAULT 0,
    avg_upload_time INTEGER DEFAULT 0,
    UNIQUE(date)
);
```

## Environment Variables

Ensure these environment variables are configured:

```bash
# Required
DATABASE_URL="postgresql://user:password@host:port/database"

# Optional
NODE_ENV="production"  # or "development"
ADMIN_TOKEN="your-secure-admin-token"
RAILWAY_VOLUME_MOUNT_PATH="/app/data"  # for Railway deployment
REDIS_URL="redis://..."  # optional for caching
```

## Troubleshooting

### Issue: Migration fails
```bash
Database migration failed: relation "clips" does not exist
```

**Solution:**
1. Verify DATABASE_URL configuration
2. Ensure PostgreSQL is running
3. Execute manual migration: `npm run migrate`

### Issue: Missing permissions
```bash
permission denied for schema public
```

**Solution:**
```sql
-- Execute as superuser
GRANT ALL PRIVILEGES ON SCHEMA public TO your_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_user;
```

### Issue: Outdated database version
```bash
function "json_build_object" does not exist
```

**Solution:**
- PostgreSQL 9.4+ required
- Update your PostgreSQL installation

## Migration Log

The migration logs all steps in detail:

```
Starting Qopy server with automatic database migration...
Database connection established
Running automatic database migration...
Creating statistics table...
Creating clips table...
Extending clips table for file support...
Creating upload_sessions table...
Creating file_chunks table...
Creating upload_statistics table...
Creating database indexes...
Creating database functions...
Creating database triggers...
Running data migrations...
Initializing default data...
Validating database schema...
Database migration completed successfully!
Tables: clips, statistics, upload_sessions, file_chunks, upload_statistics
Clips columns: 18 columns validated
Qopy server running on port 8080
```

## Migration Checklist

- [ ] DATABASE_URL correctly configured
- [ ] PostgreSQL 9.4+ running
- [ ] Sufficient database permissions
- [ ] Migration test successful: `npm run test-migration`
- [ ] Server starts without errors: `npm start`
- [ ] Admin dashboard accessible: `/admin`
- [ ] Text sharing functional
- [ ] File sharing functional

## Support

For issues:
1. Execute `npm run test-migration`
2. Check server logs
3. Consult this guide
4. Create an issue with error messages

## Rollback (if required)

If you need to revert to the previous version:

```sql
-- Create backup (IMPORTANT!)
pg_dump $DATABASE_URL > backup_before_rollback.sql

-- Remove new tables
DROP TABLE IF EXISTS file_chunks CASCADE;
DROP TABLE IF EXISTS upload_sessions CASCADE;
DROP TABLE IF EXISTS upload_statistics CASCADE;

-- Remove new columns from clips
ALTER TABLE clips DROP COLUMN IF EXISTS content_type;
ALTER TABLE clips DROP COLUMN IF EXISTS file_metadata;
ALTER TABLE clips DROP COLUMN IF EXISTS file_path;
ALTER TABLE clips DROP COLUMN IF EXISTS original_filename;
ALTER TABLE clips DROP COLUMN IF EXISTS mime_type;
ALTER TABLE clips DROP COLUMN IF EXISTS filesize;
ALTER TABLE clips DROP COLUMN IF EXISTS is_file;
ALTER TABLE clips DROP COLUMN IF EXISTS content;
```

---

**After successful migration, you have access to all new file-sharing features of Qopy.**