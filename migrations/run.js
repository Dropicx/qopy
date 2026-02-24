/*
 * Copyright (C) 2025 Qopy App
 * Database migrations - run on server startup
 */

/**
 * Run all database migrations. Idempotent - safe to run multiple times.
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 */
async function runMigrations(pool) {
    const client = await pool.connect();
    try {
        // Create statistics table if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS statistics (
                id SERIAL PRIMARY KEY,
                total_clips BIGINT DEFAULT 0,
                total_accesses BIGINT DEFAULT 0,
                quick_share_clips BIGINT DEFAULT 0,
                password_protected_clips BIGINT DEFAULT 0,
                one_time_clips BIGINT DEFAULT 0,
                normal_clips BIGINT DEFAULT 0,
                last_updated BIGINT DEFAULT 0
            )
        `);

        // Create upload_sessions table for multi-part uploads
        await client.query(`
            CREATE TABLE IF NOT EXISTS upload_sessions (
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
            )
        `);

        try {
            await client.query(`ALTER TABLE upload_sessions ADD COLUMN IF NOT EXISTS is_text_content BOOLEAN DEFAULT false`);
            await client.query(`ALTER TABLE upload_sessions DROP COLUMN IF EXISTS original_content`);
            console.log('✅ upload_sessions table migration completed');
        } catch (migrationError) {
            console.warn(`⚠️ upload_sessions migration warning: ${migrationError.message}`);
        }

        // Create file_chunks table
        await client.query(`
            CREATE TABLE IF NOT EXISTS file_chunks (
                id SERIAL PRIMARY KEY,
                upload_id VARCHAR(50) NOT NULL,
                chunk_number INTEGER NOT NULL,
                chunk_size INTEGER NOT NULL,
                storage_path VARCHAR(500) NOT NULL,
                created_at BIGINT NOT NULL,
                UNIQUE(upload_id, chunk_number),
                FOREIGN KEY (upload_id) REFERENCES upload_sessions(upload_id) ON DELETE CASCADE
            )
        `);

        try {
            const checksumColumnCheck = await client.query(`
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'file_chunks' AND column_name = 'checksum'
            `);
            if (checksumColumnCheck.rows.length > 0) {
                await client.query(`ALTER TABLE file_chunks DROP COLUMN checksum`);
                console.log('🗑️ Removed checksum column from file_chunks');
            }
        } catch (e) {
            console.warn(`⚠️ checksum migration: ${e.message}`);
        }

        // Create clips table
        await client.query(`
            CREATE TABLE IF NOT EXISTS clips (
                id SERIAL PRIMARY KEY,
                clip_id VARCHAR(10) UNIQUE NOT NULL,
                password_hash VARCHAR(255),
                one_time BOOLEAN DEFAULT false,
                quick_share BOOLEAN DEFAULT false,
                expiration_time BIGINT NOT NULL,
                access_count INTEGER DEFAULT 0,
                max_accesses INTEGER DEFAULT 1,
                created_at BIGINT NOT NULL
            )
        `);

        try {
            await client.query(`ALTER TABLE clips ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT 'text'`);
            await client.query(`ALTER TABLE clips ADD COLUMN IF NOT EXISTS file_metadata JSONB`);
            await client.query(`ALTER TABLE clips ADD COLUMN IF NOT EXISTS file_path VARCHAR(500)`);
            await client.query(`ALTER TABLE clips ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255)`);
            await client.query(`ALTER TABLE clips ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100)`);
            await client.query(`ALTER TABLE clips ADD COLUMN IF NOT EXISTS filesize BIGINT`);
            await client.query(`ALTER TABLE clips ADD COLUMN IF NOT EXISTS is_file BOOLEAN DEFAULT false`);
            await client.query(`ALTER TABLE clips ADD COLUMN IF NOT EXISTS is_expired BOOLEAN DEFAULT false`);
            await client.query(`ALTER TABLE clips ADD COLUMN IF NOT EXISTS accessed_at BIGINT`);
            await client.query(`ALTER TABLE clips ADD COLUMN IF NOT EXISTS access_code_hash VARCHAR(255)`);
            await client.query(`ALTER TABLE clips ADD COLUMN IF NOT EXISTS requires_access_code BOOLEAN DEFAULT false`);
            await client.query(`ALTER TABLE clips ADD COLUMN IF NOT EXISTS quick_share BOOLEAN DEFAULT false`);

            await client.query(`UPDATE clips SET is_expired = true WHERE expiration_time < $1 AND is_expired = false`, [Date.now()]);
            await client.query(`UPDATE clips SET content_type = 'file' WHERE file_path IS NOT NULL AND content_type = 'text'`);

            const unusedColumnsCheck = await client.query(`
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'clips' AND column_name IN ('content', 'client_ip', 'last_accessed', 'upload_id', 'max_accesses')
            `);
            const existingUnusedColumns = unusedColumnsCheck.rows.map(row => row.column_name);
            for (const columnName of existingUnusedColumns) {
                if (columnName === 'upload_id') {
                    try { await client.query(`DROP INDEX IF EXISTS idx_clips_upload_id`); } catch (e) { /* ignore */ }
                }
                try {
                    await client.query(`ALTER TABLE clips DROP COLUMN ${columnName}`);
                    console.log(`🗑️ Removed unused ${columnName} from clips`);
                } catch (e) {
                    console.warn(`⚠️ Could not drop ${columnName}: ${e.message}`);
                }
            }
        } catch (alterError) {
            console.warn(`⚠️ Clips table extension: ${alterError.message}`);
        }

        const statsCheck = await client.query('SELECT COUNT(*) as count FROM statistics');
        if (parseInt(statsCheck.rows[0].count) === 0) {
            await client.query(`
                INSERT INTO statistics (total_clips, total_accesses, quick_share_clips, password_protected_clips, one_time_clips, normal_clips, last_updated)
                VALUES (0, 0, 0, 0, 0, 0, $1)
            `, [Date.now()]);
            console.log('📊 Statistics table initialized');
        }

        await client.query(`
            CREATE TABLE IF NOT EXISTS upload_statistics (
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
            )
        `);

        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_upload_sessions_upload_id ON upload_sessions(upload_id)',
            'CREATE INDEX IF NOT EXISTS idx_upload_sessions_status_expiration ON upload_sessions(status, expiration_time)',
            'CREATE INDEX IF NOT EXISTS idx_upload_sessions_created_at ON upload_sessions(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_file_chunks_upload_chunk ON file_chunks(upload_id, chunk_number)',
            'CREATE INDEX IF NOT EXISTS idx_file_chunks_created_at ON file_chunks(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_upload_statistics_date ON upload_statistics(date)',
            'CREATE INDEX IF NOT EXISTS idx_clips_content_type ON clips(content_type)',
            'CREATE INDEX IF NOT EXISTS idx_clips_file_path ON clips(file_path)'
        ];
        for (const q of indexes) {
            try { await client.query(q); } catch (e) { console.warn(`⚠️ Index: ${e.message}`); }
        }

        await client.query(`
            CREATE OR REPLACE FUNCTION cleanup_expired_uploads() RETURNS void AS $$
            BEGIN
                DELETE FROM upload_sessions WHERE expiration_time < EXTRACT(EPOCH FROM NOW()) * 1000;
                DELETE FROM file_chunks WHERE upload_id NOT IN (SELECT upload_id FROM upload_sessions);
            END;
            $$ LANGUAGE plpgsql
        `);

        await client.query(`
            CREATE OR REPLACE FUNCTION update_upload_stats() RETURNS TRIGGER AS $$
            BEGIN
                IF TG_OP = 'INSERT' THEN
                    INSERT INTO upload_statistics (date, total_uploads, total_file_size)
                    VALUES (CURRENT_DATE, 1, NEW.filesize)
                    ON CONFLICT (date) DO UPDATE SET total_uploads = upload_statistics.total_uploads + 1, total_file_size = upload_statistics.total_file_size + NEW.filesize;
                    RETURN NEW;
                END IF;
                IF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status != 'completed' THEN
                    INSERT INTO upload_statistics (date, completed_uploads) VALUES (CURRENT_DATE, 1)
                    ON CONFLICT (date) DO UPDATE SET completed_uploads = upload_statistics.completed_uploads + 1;
                    RETURN NEW;
                END IF;
                RETURN NULL;
            END;
            $$ LANGUAGE plpgsql
        `);

        await client.query(`DROP TRIGGER IF EXISTS trigger_upload_stats ON upload_sessions`);
        await client.query(`
            CREATE TRIGGER trigger_upload_stats
                AFTER INSERT OR UPDATE ON upload_sessions
                FOR EACH ROW EXECUTE FUNCTION update_upload_stats()
        `);

        await client.query(`
            INSERT INTO upload_statistics (date, total_uploads, total_file_size, completed_uploads, failed_uploads, text_clips, file_clips, avg_upload_time)
            VALUES (CURRENT_DATE, 0, 0, 0, 0, 0, 0, 0)
            ON CONFLICT (date) DO NOTHING
        `);

        try {
            const tableExists = await client.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'clips')`);
            if (tableExists.rows[0].exists) {
                const currentDef = await client.query(`
                    SELECT character_maximum_length FROM information_schema.columns
                    WHERE table_name = 'clips' AND column_name = 'clip_id'
                `);
                if (currentDef.rows.length > 0 && currentDef.rows[0].character_maximum_length < 10) {
                    await client.query('ALTER TABLE clips ALTER COLUMN clip_id TYPE VARCHAR(10)');
                }
            }
        } catch (e) {
            console.warn(`⚠️ clip_id migration: ${e.message}`);
        }

        console.log('✅ Database migrations completed successfully');
    } finally {
        client.release();
    }
}

module.exports = { runMigrations };
