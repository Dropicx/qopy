-- Qopy Database Migration for Multi-Part Upload & File Sharing
-- Version: 3.0.0 (Complete Migration with File Sharing Support)
-- Date: 2025
--
-- ⚠️  NOTE: This script is now OPTIONAL!
-- The database migration runs AUTOMATICALLY on server startup.
-- Use this script only for manual migration or troubleshooting.
-- 
-- To run manually:
-- psql $DATABASE_URL -f scripts/database-migration.sql

-- BEGIN TRANSACTION
BEGIN;

-- 1. CREATE STATISTICS TABLE
CREATE TABLE IF NOT EXISTS statistics (
    id SERIAL PRIMARY KEY,
    total_clips BIGINT DEFAULT 0,
    total_accesses BIGINT DEFAULT 0,
    quick_share_clips BIGINT DEFAULT 0,
    password_protected_clips BIGINT DEFAULT 0,
    one_time_clips BIGINT DEFAULT 0,
    normal_clips BIGINT DEFAULT 0,
    last_updated BIGINT DEFAULT 0
);

-- 2. CREATE CLIPS TABLE (Base table)
CREATE TABLE IF NOT EXISTS clips (
    id SERIAL PRIMARY KEY,
    clip_id VARCHAR(10) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    one_time BOOLEAN DEFAULT false,
    quick_share BOOLEAN DEFAULT false,
    expiration_time BIGINT NOT NULL,
    access_count INTEGER DEFAULT 0,
    created_at BIGINT NOT NULL,
    accessed_at BIGINT,
    is_expired BOOLEAN DEFAULT false
);

-- 3. EXTEND CLIPS TABLE FOR FILE SUPPORT
ALTER TABLE clips ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT 'text';
ALTER TABLE clips ADD COLUMN IF NOT EXISTS file_metadata JSONB;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS file_path VARCHAR(500);
ALTER TABLE clips ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255);
ALTER TABLE clips ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);
ALTER TABLE clips ADD COLUMN IF NOT EXISTS filesize BIGINT;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS is_file BOOLEAN DEFAULT false;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS content BYTEA;

-- 4. CREATE UPLOAD_SESSIONS TABLE
CREATE TABLE IF NOT EXISTS upload_sessions (
    id SERIAL PRIMARY KEY,
    upload_id VARCHAR(50) UNIQUE NOT NULL,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    filesize BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    chunk_size INTEGER NOT NULL DEFAULT 5242880, -- 5MB default
    total_chunks INTEGER NOT NULL,
    uploaded_chunks INTEGER DEFAULT 0,
    checksums TEXT[], -- Array of chunk checksums
    status VARCHAR(20) DEFAULT 'uploading', -- uploading, completed, failed, expired
    expiration_time BIGINT NOT NULL,
    has_password BOOLEAN DEFAULT false,
    one_time BOOLEAN DEFAULT false,
    quick_share BOOLEAN DEFAULT false,
    is_text_content BOOLEAN DEFAULT false,
    client_ip VARCHAR(45), -- For rate limiting
    created_at BIGINT NOT NULL,
    last_activity BIGINT NOT NULL,
    completed_at BIGINT
);

-- 5. CREATE FILE_CHUNKS TABLE
CREATE TABLE IF NOT EXISTS file_chunks (
    id SERIAL PRIMARY KEY,
    upload_id VARCHAR(50) NOT NULL,
    chunk_number INTEGER NOT NULL,
    chunk_size INTEGER NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    storage_path VARCHAR(500) NOT NULL, -- Path to chunk file on volume
    created_at BIGINT NOT NULL,
    
    -- Ensure unique chunks per upload
    UNIQUE(upload_id, chunk_number)
);

-- Add foreign key constraint if it doesn't exist
ALTER TABLE file_chunks 
ADD CONSTRAINT IF NOT EXISTS fk_file_chunks_upload_id 
FOREIGN KEY (upload_id) REFERENCES upload_sessions(upload_id) ON DELETE CASCADE;

-- 6. CREATE UPLOAD_STATISTICS TABLE
CREATE TABLE IF NOT EXISTS upload_statistics (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    total_uploads INTEGER DEFAULT 0,
    total_file_size BIGINT DEFAULT 0,
    completed_uploads INTEGER DEFAULT 0,
    failed_uploads INTEGER DEFAULT 0,
    text_clips INTEGER DEFAULT 0,
    file_clips INTEGER DEFAULT 0,
    avg_upload_time INTEGER DEFAULT 0, -- in milliseconds
    
    UNIQUE(date)
);

-- 7. CREATE ALL NECESSARY INDEXES
CREATE INDEX IF NOT EXISTS idx_clips_clip_id ON clips(clip_id);
CREATE INDEX IF NOT EXISTS idx_clips_expiration ON clips(expiration_time);
CREATE INDEX IF NOT EXISTS idx_clips_content_type ON clips(content_type);
CREATE INDEX IF NOT EXISTS idx_clips_file_path ON clips(file_path);
CREATE INDEX IF NOT EXISTS idx_clips_is_expired ON clips(is_expired);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_upload_id ON upload_sessions(upload_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status_expiration ON upload_sessions(status, expiration_time);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_created_at ON upload_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_file_chunks_upload_chunk ON file_chunks(upload_id, chunk_number);
CREATE INDEX IF NOT EXISTS idx_file_chunks_created_at ON file_chunks(created_at);
CREATE INDEX IF NOT EXISTS idx_upload_statistics_date ON upload_statistics(date);
CREATE INDEX IF NOT EXISTS idx_statistics_id ON statistics(id);

-- 8. CREATE DATABASE FUNCTIONS

-- Cleanup function for expired uploads
CREATE OR REPLACE FUNCTION cleanup_expired_uploads() RETURNS void AS $$
BEGIN
    -- Delete expired upload sessions and their chunks
    DELETE FROM upload_sessions WHERE expiration_time < EXTRACT(EPOCH FROM NOW()) * 1000;
    
    -- Delete orphaned chunks (safety cleanup)
    DELETE FROM file_chunks WHERE upload_id NOT IN (SELECT upload_id FROM upload_sessions);
END;
$$ LANGUAGE plpgsql;

-- Statistics trigger function
CREATE OR REPLACE FUNCTION update_upload_stats() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO upload_statistics (date, total_uploads, total_file_size) 
        VALUES (CURRENT_DATE, 1, NEW.filesize)
        ON CONFLICT (date) 
        DO UPDATE SET 
            total_uploads = upload_statistics.total_uploads + 1,
            total_file_size = upload_statistics.total_file_size + NEW.filesize;
        RETURN NEW;
    END IF;
    
    IF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status != 'completed' THEN
        INSERT INTO upload_statistics (date, completed_uploads) 
        VALUES (CURRENT_DATE, 1)
        ON CONFLICT (date) 
        DO UPDATE SET completed_uploads = upload_statistics.completed_uploads + 1;
        RETURN NEW;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 9. CREATE TRIGGERS
DROP TRIGGER IF EXISTS trigger_upload_stats ON upload_sessions;
CREATE TRIGGER trigger_upload_stats
    AFTER INSERT OR UPDATE ON upload_sessions
    FOR EACH ROW EXECUTE FUNCTION update_upload_stats();

-- 10. DATA MIGRATIONS AND CLEANUP

-- Update existing expired clips
UPDATE clips 
SET is_expired = true 
WHERE expiration_time < EXTRACT(EPOCH FROM NOW()) * 1000 AND is_expired = false;

-- Fix content_type for existing files
UPDATE clips 
SET content_type = 'file' 
WHERE file_path IS NOT NULL AND content_type = 'text';

-- Remove unused columns (check first if they exist)
DO $$
DECLARE
    column_name TEXT;
    column_exists BOOLEAN;
BEGIN
    -- List of columns to remove
    FOR column_name IN SELECT unnest(ARRAY['client_ip', 'last_accessed', 'upload_id', 'max_accesses'])
    LOOP
        -- Check if column exists
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'clips' AND column_name = column_name
        ) INTO column_exists;
        
        IF column_exists THEN
            -- Drop related indexes first
            IF column_name = 'upload_id' THEN
                EXECUTE 'DROP INDEX IF EXISTS idx_clips_upload_id';
            END IF;
            
            -- Drop the column
            EXECUTE 'ALTER TABLE clips DROP COLUMN ' || column_name;
            RAISE NOTICE 'Removed unused column: %', column_name;
        END IF;
    END LOOP;
END
$$;

-- 11. INITIALIZE DATA

-- Initialize statistics if empty
INSERT INTO statistics (total_clips, total_accesses, quick_share_clips, 
                       password_protected_clips, one_time_clips, normal_clips, last_updated)
SELECT 0, 0, 0, 0, 0, 0, EXTRACT(EPOCH FROM NOW()) * 1000
WHERE NOT EXISTS (SELECT 1 FROM statistics);

-- Initialize upload statistics for today
INSERT INTO upload_statistics (date, total_uploads, total_file_size, completed_uploads, failed_uploads, text_clips, file_clips, avg_upload_time)
VALUES (CURRENT_DATE, 0, 0, 0, 0, 0, 0, 0)
ON CONFLICT (date) DO NOTHING;

-- 12. VALIDATION

-- Verify all required tables exist
DO $$
DECLARE
    missing_tables TEXT[];
    table_name TEXT;
    required_tables TEXT[] := ARRAY['clips', 'statistics', 'upload_sessions', 'file_chunks', 'upload_statistics'];
BEGIN
    FOR table_name IN SELECT unnest(required_tables)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = table_name
        ) THEN
            missing_tables := array_append(missing_tables, table_name);
        END IF;
    END LOOP;
    
    IF array_length(missing_tables, 1) > 0 THEN
        RAISE EXCEPTION 'Missing required tables: %', array_to_string(missing_tables, ', ');
    ELSE
        RAISE NOTICE '✅ All required tables exist: %', array_to_string(required_tables, ', ');
    END IF;
END
$$;

-- Verify critical columns in clips table
DO $$
DECLARE
    missing_columns TEXT[];
    column_name TEXT;
    critical_columns TEXT[] := ARRAY['clip_id', 'content_type', 'file_path', 'filesize', 'is_expired'];
BEGIN
    FOR column_name IN SELECT unnest(critical_columns)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'clips' AND column_name = column_name
        ) THEN
            missing_columns := array_append(missing_columns, column_name);
        END IF;
    END LOOP;
    
    IF array_length(missing_columns, 1) > 0 THEN
        RAISE EXCEPTION 'Missing critical columns in clips table: %', array_to_string(missing_columns, ', ');
    ELSE
        RAISE NOTICE '✅ All critical columns exist in clips table';
    END IF;
END
$$;

-- COMMIT TRANSACTION
COMMIT;

-- Final success message
\echo 'Database migration completed successfully!'
\echo 'Tables created: clips, statistics, upload_sessions, file_chunks, upload_statistics'
\echo 'All indexes, functions, and triggers are in place.'
\echo 'The Qopy application is ready to start!' 