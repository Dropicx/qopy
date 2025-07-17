-- Qopy Database Migration for Multi-Part Upload & File Sharing
-- Version: 2.0.0
-- Date: 2025
--
-- ⚠️  NOTE: This script is now OPTIONAL!
-- The database migration runs AUTOMATICALLY on server startup.
-- Use this script only for manual migration or troubleshooting.
-- 
-- To run manually:
-- psql $DATABASE_URL -f scripts/database-migration.sql

-- Create upload_sessions table for managing multi-part uploads
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
    client_ip VARCHAR(45), -- For rate limiting
    created_at BIGINT NOT NULL,
    last_activity BIGINT NOT NULL,
    completed_at BIGINT
);

-- Create file_chunks table for temporary chunk storage
CREATE TABLE IF NOT EXISTS file_chunks (
    id SERIAL PRIMARY KEY,
    upload_id VARCHAR(50) NOT NULL,
    chunk_number INTEGER NOT NULL,
    chunk_size INTEGER NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    storage_path VARCHAR(500) NOT NULL, -- Path to chunk file on volume
    created_at BIGINT NOT NULL,
    
    -- Ensure unique chunks per upload
    UNIQUE(upload_id, chunk_number),
    
    -- Foreign key to upload_sessions
    FOREIGN KEY (upload_id) REFERENCES upload_sessions(upload_id) ON DELETE CASCADE
);

-- Extend existing clips table for file support
ALTER TABLE clips ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT 'text'; -- 'text' or 'file'
ALTER TABLE clips ADD COLUMN IF NOT EXISTS file_metadata JSONB;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS file_path VARCHAR(500);
ALTER TABLE clips ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255);
ALTER TABLE clips ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);
ALTER TABLE clips ADD COLUMN IF NOT EXISTS filesize BIGINT;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS upload_id VARCHAR(50); -- Link to upload session

-- Create indexes for upload_sessions table
CREATE INDEX IF NOT EXISTS idx_upload_sessions_upload_id ON upload_sessions(upload_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status_expiration ON upload_sessions(status, expiration_time);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_created_at ON upload_sessions(created_at);

-- Create indexes for file_chunks table
CREATE INDEX IF NOT EXISTS idx_file_chunks_upload_chunk ON file_chunks(upload_id, chunk_number);
CREATE INDEX IF NOT EXISTS idx_file_chunks_created_at ON file_chunks(created_at);

-- Create indexes for upload_statistics table
CREATE INDEX IF NOT EXISTS idx_upload_statistics_date ON upload_statistics(date);

-- Add indexes for new columns in clips table
CREATE INDEX IF NOT EXISTS idx_clips_content_type ON clips(content_type);
CREATE INDEX IF NOT EXISTS idx_clips_upload_id ON clips(upload_id);
CREATE INDEX IF NOT EXISTS idx_clips_file_path ON clips(file_path);

-- Create upload_statistics table for monitoring
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

-- Create cleanup procedure for expired uploads
CREATE OR REPLACE FUNCTION cleanup_expired_uploads() RETURNS void AS $$
BEGIN
    -- Delete expired upload sessions and their chunks
    DELETE FROM upload_sessions WHERE expiration_time < EXTRACT(EPOCH FROM NOW()) * 1000;
    
    -- Delete orphaned chunks (safety cleanup)
    DELETE FROM file_chunks WHERE upload_id NOT IN (SELECT upload_id FROM upload_sessions);
END;
$$ LANGUAGE plpgsql;

-- Add trigger to automatically update upload statistics
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

-- Create trigger
DROP TRIGGER IF EXISTS trigger_upload_stats ON upload_sessions;
CREATE TRIGGER trigger_upload_stats
    AFTER INSERT OR UPDATE ON upload_sessions
    FOR EACH ROW EXECUTE FUNCTION update_upload_stats();

-- Insert initial data for today if not exists
INSERT INTO upload_statistics (date, total_uploads, total_file_size, completed_uploads, failed_uploads, text_clips, file_clips, avg_upload_time)
VALUES (CURRENT_DATE, 0, 0, 0, 0, 0, 0, 0)
ON CONFLICT (date) DO NOTHING; 