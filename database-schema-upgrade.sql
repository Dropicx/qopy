-- Qopy Database Schema Upgrade for Multi-Part Upload & File Sharing
-- Copyright (C) 2025 Qopy App

-- 1. Erweitere bestehende clips Tabelle für File-Support
ALTER TABLE clips 
ADD COLUMN IF NOT EXISTS file_metadata JSONB,
ADD COLUMN IF NOT EXISTS file_path VARCHAR(500),
ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255),
ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS filesize BIGINT,
ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT 'text' CHECK (content_type IN ('text', 'file'));

-- Index für bessere Performance bei File-Queries
CREATE INDEX IF NOT EXISTS idx_clips_content_type ON clips(content_type);
CREATE INDEX IF NOT EXISTS idx_clips_mime_type ON clips(mime_type);

-- 2. Neue Tabelle für Upload-Sessions
CREATE TABLE IF NOT EXISTS upload_sessions (
    id SERIAL PRIMARY KEY,
    upload_id VARCHAR(50) UNIQUE NOT NULL,
    filename VARCHAR(255) NOT NULL,
    filesize BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    chunk_size INTEGER NOT NULL DEFAULT 5242880, -- 5MB default
    total_chunks INTEGER NOT NULL,
    uploaded_chunks INTEGER DEFAULT 0,
    checksums TEXT[], -- Array der Chunk-Checksums
    status VARCHAR(20) DEFAULT 'uploading' CHECK (status IN ('uploading', 'completed', 'failed', 'cancelled')),
    expiration_time BIGINT NOT NULL,
    password_hash VARCHAR(255),
    one_time BOOLEAN DEFAULT false,
    quick_share BOOLEAN DEFAULT false,
    created_at BIGINT NOT NULL,
    last_activity BIGINT NOT NULL
);

-- Indizes für Upload-Sessions
CREATE INDEX IF NOT EXISTS idx_upload_sessions_upload_id ON upload_sessions(upload_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_expiration ON upload_sessions(expiration_time);

-- 3. Tabelle für Chunk-Speicherung (temporär während Upload)
CREATE TABLE IF NOT EXISTS file_chunks (
    id SERIAL PRIMARY KEY,
    upload_id VARCHAR(50) NOT NULL,
    chunk_number INTEGER NOT NULL,
    chunk_data BYTEA NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    created_at BIGINT NOT NULL,
    UNIQUE(upload_id, chunk_number)
);

-- Index für Chunk-Queries
CREATE INDEX IF NOT EXISTS idx_file_chunks_upload_id ON file_chunks(upload_id);
CREATE INDEX IF NOT EXISTS idx_file_chunks_chunk_number ON file_chunks(upload_id, chunk_number);

-- 4. Statistiken erweitern
INSERT INTO statistics (key, value) VALUES 
('file_uploads_total', 0),
('file_downloads_total', 0),
('file_storage_used', 0),
('upload_sessions_total', 0),
('upload_sessions_active', 0)
ON CONFLICT (key) DO NOTHING;

-- 5. Cleanup-Funktion für expired upload sessions
CREATE OR REPLACE FUNCTION cleanup_expired_uploads()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete expired upload sessions and their chunks
    WITH expired_uploads AS (
        DELETE FROM upload_sessions 
        WHERE expiration_time < EXTRACT(EPOCH FROM NOW()) * 1000
        RETURNING upload_id
    ),
    deleted_chunks AS (
        DELETE FROM file_chunks 
        WHERE upload_id IN (SELECT upload_id FROM expired_uploads)
        RETURNING 1
    )
    SELECT COUNT(*) INTO deleted_count FROM expired_uploads;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 6. Auto-Cleanup für abgebrochene Upload-Sessions (älter als 24h)
CREATE OR REPLACE FUNCTION cleanup_stale_uploads()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete upload sessions that haven't been active for 24 hours
    WITH stale_uploads AS (
        DELETE FROM upload_sessions 
        WHERE last_activity < (EXTRACT(EPOCH FROM NOW()) * 1000) - (24 * 60 * 60 * 1000)
        AND status = 'uploading'
        RETURNING upload_id
    ),
    deleted_chunks AS (
        DELETE FROM file_chunks 
        WHERE upload_id IN (SELECT upload_id FROM stale_uploads)
        RETURNING 1
    )
    SELECT COUNT(*) INTO deleted_count FROM stale_uploads;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 7. Trigger für automatische Chunk-Zählung
CREATE OR REPLACE FUNCTION update_uploaded_chunks()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE upload_sessions 
        SET uploaded_chunks = uploaded_chunks + 1,
            last_activity = EXTRACT(EPOCH FROM NOW()) * 1000
        WHERE upload_id = NEW.upload_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE upload_sessions 
        SET uploaded_chunks = uploaded_chunks - 1,
            last_activity = EXTRACT(EPOCH FROM NOW()) * 1000
        WHERE upload_id = OLD.upload_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger erstellen
DROP TRIGGER IF EXISTS trigger_update_uploaded_chunks ON file_chunks;
CREATE TRIGGER trigger_update_uploaded_chunks
    AFTER INSERT OR DELETE ON file_chunks
    FOR EACH ROW EXECUTE FUNCTION update_uploaded_chunks();

-- 8. Funktion für File-Storage-Statistiken
CREATE OR REPLACE FUNCTION update_storage_stats()
RETURNS VOID AS $$
BEGIN
    UPDATE statistics 
    SET value = (
        SELECT COALESCE(SUM(filesize), 0) 
        FROM clips 
        WHERE content_type = 'file' 
        AND expiration_time > EXTRACT(EPOCH FROM NOW()) * 1000
    )
    WHERE key = 'file_storage_used';
    
    UPDATE statistics 
    SET value = (
        SELECT COUNT(*) 
        FROM upload_sessions 
        WHERE status = 'uploading'
    )
    WHERE key = 'upload_sessions_active';
END;
$$ LANGUAGE plpgsql; 

-- Qopy Database Security Fix - Remove original_content column
-- Version: 2.1.0
-- Date: 2025-01-XX
--
-- ⚠️  SECURITY FIX: Remove original_content column that was storing plaintext
-- This column was a security vulnerability as it stored unencrypted content
-- on the server, violating the zero-knowledge architecture principle.
--
-- To run manually:
-- psql $DATABASE_URL -f database-schema-upgrade.sql

-- Remove the original_content column from upload_sessions table
-- This column was storing plaintext content, which violates security principles
ALTER TABLE upload_sessions DROP COLUMN IF EXISTS original_content;

-- Verify the column has been removed
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'upload_sessions' 
        AND column_name = 'original_content'
    ) THEN
        RAISE EXCEPTION 'original_content column still exists - manual intervention required';
    ELSE
        RAISE NOTICE '✅ Successfully removed original_content column from upload_sessions table';
    END IF;
END $$;

-- Add a comment to document this security fix
COMMENT ON TABLE upload_sessions IS 'Upload sessions for multi-part file uploads. SECURITY: No plaintext content is stored - all content is client-side encrypted.'; 