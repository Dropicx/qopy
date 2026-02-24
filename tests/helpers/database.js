/*
 * Copyright (C) 2025 Qopy App
 * 
 * This file is part of Qopy.
 * 
 * Qopy is dual-licensed:
 * 
 * 1. GNU Affero General Public License v3.0 (AGPL-3.0)
 *    For open source use. See LICENSE-AGPL for details.
 * 
 * 2. Commercial License
 *    For proprietary/commercial use. Contact qopy@lit.services
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

const { Pool } = require('pg');

class TestDatabase {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/qopy_test',
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  async setup() {
    await this.createTables();
  }

  async teardown() {
    await this.clearAllTables();
    await this.pool.end();
  }

  async createTables() {
    const createTablesSQL = `
      CREATE TABLE IF NOT EXISTS clips (
        id VARCHAR(36) PRIMARY KEY,
        content TEXT,
        password_hash VARCHAR(255),
        salt VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        view_count INTEGER DEFAULT 0,
        max_views INTEGER,
        file_path VARCHAR(255),
        file_name VARCHAR(255),
        file_size BIGINT,
        mime_type VARCHAR(100),
        quick_share BOOLEAN DEFAULT FALSE
      );

      CREATE TABLE IF NOT EXISTS file_uploads (
        id VARCHAR(36) PRIMARY KEY,
        original_name VARCHAR(255) NOT NULL,
        file_size BIGINT NOT NULL,
        mime_type VARCHAR(100),
        chunk_count INTEGER DEFAULT 1,
        chunks_received INTEGER DEFAULT 0,
        is_complete BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        temp_path VARCHAR(255),
        final_path VARCHAR(255)
      );

      CREATE INDEX IF NOT EXISTS idx_clips_expires_at ON clips(expires_at);
      CREATE INDEX IF NOT EXISTS idx_file_uploads_expires_at ON file_uploads(expires_at);
    `;

    await this.pool.query(createTablesSQL);
  }

  async clearAllTables() {
    await this.pool.query('DELETE FROM clips');
    await this.pool.query('DELETE FROM file_uploads');
  }

  async insertTestClip(clipData) {
    const {
      id, content, password_hash, salt, expires_at, 
      file_path, file_name, file_size, mime_type, quick_share
    } = clipData;

    const result = await this.pool.query(
      `INSERT INTO clips (id, content, password_hash, salt, expires_at, file_path, file_name, file_size, mime_type, quick_share)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [id, content, password_hash, salt, expires_at, file_path, file_name, file_size, mime_type, quick_share]
    );

    return result.rows[0];
  }

  async insertTestUpload(uploadData) {
    const {
      id, original_name, file_size, mime_type, chunk_count, 
      chunks_received, is_complete, temp_path, final_path
    } = uploadData;

    const result = await this.pool.query(
      `INSERT INTO file_uploads (id, original_name, file_size, mime_type, chunk_count, chunks_received, is_complete, temp_path, final_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [id, original_name, file_size, mime_type, chunk_count, chunks_received, is_complete, temp_path, final_path]
    );

    return result.rows[0];
  }

  getPool() {
    return this.pool;
  }
}

module.exports = TestDatabase;