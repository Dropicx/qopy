-- Migration: Extend clip_id column from VARCHAR(6) to VARCHAR(10)
-- This allows for 10-character normal clip IDs and 4-character Quick Share IDs

-- First, check if the column exists and its current definition
SELECT column_name, data_type, character_maximum_length 
FROM information_schema.columns 
WHERE table_name = 'clips' AND column_name = 'clip_id';

-- Alter the column to support longer clip IDs
ALTER TABLE clips ALTER COLUMN clip_id TYPE VARCHAR(10);

-- Verify the change
SELECT column_name, data_type, character_maximum_length 
FROM information_schema.columns 
WHERE table_name = 'clips' AND column_name = 'clip_id';

-- Add a comment to document the change
COMMENT ON COLUMN clips.clip_id IS 'Clip ID: 4 characters for Quick Share, 10 characters for normal clips'; 