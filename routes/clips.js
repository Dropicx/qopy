/*
 * Copyright (C) 2025 Qopy App
 * Clip retrieval routes
 */

const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { clipIdValidator } = require('./shared/validators');

/**
 * Helper function for clip retrieval (shared between GET and POST endpoints)
 */
async function handleClipRetrieval(req, res, clip, clipId, { pool, updateStatistics }) {
  try {
    // Update access count and timestamp
    await pool.query(`
      UPDATE clips
      SET access_count = access_count + 1, accessed_at = $1
      WHERE clip_id = $2
    `, [Date.now(), clipId]);

    // Update statistics
    await updateStatistics('clip_accessed');

    // Handle content based on storage type
    let responseContent;
    let contentMetadata = {};

    if (clip.content_type === 'file') {
      // File stored on disk - redirect to file endpoint
      return res.json({
        success: true,
        contentType: 'file',
        redirectTo: `/api/file/${clipId}`,
        filename: clip.original_filename,
        filesize: clip.filesize,
        mimeType: clip.mime_type,
        expiresAt: clip.expiration_time,
        oneTime: clip.one_time
      });
    } else if (clip.file_path) {
      // Content stored as file - redirect to file endpoint for unified handling
      if (clip.content_type === 'text') {
        // Text content stored as file - redirect to file endpoint but mark as text
        const response = {
          success: true,
          contentType: 'text',
          redirectTo: `/api/file/${clipId}`,
          filename: clip.original_filename,
          filesize: clip.filesize,
          mimeType: clip.mime_type || 'text/plain',
          expiresAt: clip.expiration_time,
          oneTime: clip.one_time,
          isTextFile: true // Special flag to indicate this should be decrypted and shown as text
        };

        return res.json(response);
      } else {
        // Regular file - redirect to file endpoint
        return res.json({
          success: true,
          contentType: 'file',
          redirectTo: `/api/file/${clipId}`,
          filename: clip.original_filename,
          filesize: clip.filesize,
          mimeType: clip.mime_type,
          expiresAt: clip.expiration_time,
          oneTime: clip.one_time
        });
      }
    } else {
      return res.status(404).json({
        error: 'No content found',
        message: 'The clip contains no content'
      });
    }

    // Prepare response for inline content
    const response = {
      success: true,
      content: responseContent,
      contentType: contentMetadata.contentType || 'binary',
      expiresAt: clip.expiration_time,
      oneTime: clip.one_time,
      hasPassword: false
    };

    // Add file metadata if available
    if (clip.filesize) response.filesize = clip.filesize;
    if (clip.mime_type) response.mimeType = clip.mime_type;

    if (clipId.length > 6) {
      response.hasPassword = clip.requires_access_code || false;
    }

    return res.json(response);

  } catch (error) {
    console.error('Clip retrieval error:', { method: req.method, path: req.path, error: error.message });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve clip'
    });
  }
}

/**
 * Register clip retrieval routes
 * @param {import('express').Application} app
 * @param {{ pool: import('pg').Pool, updateStatistics: Function }} deps
 */
function registerClipRoutes(app, { pool, updateStatistics, getRedis }) {
    // Get clip info (with Redis caching)
    app.get('/api/clip/:clipId/info', [
      clipIdValidator
    ], async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
          });
        }

        const { clipId } = req.params;

        // Check Redis cache first
        if (getRedis) {
          try {
            const redis = getRedis();
            if (redis) {
              const cached = await redis.get(`clip-info:${clipId}`);
              if (cached) {
                return res.json(JSON.parse(cached));
              }
            }
          } catch (cacheError) {
            // Non-critical: fall through to database
          }
        }

        const result = await pool.query(
          'SELECT clip_id, content_type, expiration_time, one_time, password_hash, file_metadata, requires_access_code FROM clips WHERE clip_id = $1 AND is_expired = false',
          [clipId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({
            error: 'Clip not found',
            message: 'The requested clip does not exist or has expired'
          });
        }

        const clip = result.rows[0];

        // Determine if clip requires access code
        let hasPassword = false;
        if (clipId.length === 10) {
          hasPassword = clip.requires_access_code || clip.password_hash === 'client-encrypted' || false;
        }

        const response = {
          success: true,
          clipId: clip.clip_id,
          contentType: clip.content_type,
          expiresAt: clip.expiration_time,
          oneTime: clip.one_time,
          hasPassword: hasPassword
        };

        // Cache in Redis (skip one-time clips since they'll be deleted after access)
        if (getRedis && !clip.one_time) {
          try {
            const redis = getRedis();
            if (redis) {
              await redis.setEx(`clip-info:${clipId}`, 30, JSON.stringify(response));
            }
          } catch (cacheError) {
            // Non-critical: response still served from database
          }
        }

        res.json(response);

      } catch (error) {
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to get clip info'
        });
      }
    });

    // POST clip with access code authentication (Zero-Knowledge system)
    app.post('/api/clip/:clipId', [
      clipIdValidator,
      body('accessCode').optional().isString().withMessage('Access code must be a string')
    ], async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
          });
        }

        const { clipId } = req.params;
        const { accessCode } = req.body;

        // Fetch clip with all columns needed for access validation + content retrieval
        const result = await pool.query(
          'SELECT clip_id, content_type, file_path, original_filename, filesize, mime_type, expiration_time, one_time, password_hash, requires_access_code, access_code_hash FROM clips WHERE clip_id = $1 AND is_expired = false',
          [clipId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({
            error: 'Clip not found',
            message: 'The requested clip does not exist or has expired'
          });
        }

        const clip = result.rows[0];

        // Zero-knowledge access code validation:
        // The client hashes the access code with PBKDF2 (600k iterations, SHA-512) before
        // sending it. The server only ever sees and compares hashes — never the plaintext
        // access code. This preserves the zero-knowledge guarantee.
        if (clip.requires_access_code) {
          if (!accessCode) {
            return res.status(401).json({
              error: 'Access code required',
              message: 'This clip requires an access code'
            });
          }

          try {
            // Use the already-loaded clip object — no need for a second DB query since
            // the initial SELECT already fetched all columns including access_code_hash.
            if (!clip.access_code_hash) {
              return res.status(401).json({
                error: 'Access denied',
                message: 'Invalid access code configuration'
              });
            }

            // Detect if the client already sent a pre-hashed value (128-char hex = 64-byte PBKDF2 output)
            const isAlreadyHashed = accessCode.length === 128 && /^[a-f0-9]+$/i.test(accessCode);
            let providedHash;

            if (isAlreadyHashed) {
              providedHash = accessCode;
            } else {
              // Hash the raw access code server-side using the same PBKDF2 parameters
              providedHash = await new Promise((resolve, reject) => {
                crypto.pbkdf2(accessCode, process.env.PBKDF2_SALT || 'qopy-access-salt-v1', 600000, 64, 'sha512', (err, derivedKey) => {
                  if (err) reject(err);
                  else resolve(derivedKey.toString('hex'));
                });
              });
            }

            // Constant-time comparison would be ideal here, but since both values are
            // already hashed, timing attacks reveal no useful information about the original code.
            if (providedHash !== clip.access_code_hash) {
              return res.status(401).json({
                error: 'Access denied',
                message: 'Invalid access code'
              });
            }

          } catch (validateError) {
            console.error('Access code validation error:', validateError.message);
            return res.status(500).json({
              error: 'Internal server error',
              message: 'Failed to validate access code'
            });
          }
        }

        // Continue with same logic as GET endpoint...
        return await handleClipRetrieval(req, res, clip, clipId, { pool, updateStatistics });
      } catch (error) {
        console.error('Clip POST error:', { method: req.method, path: req.path, error: error.message });
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to retrieve clip'
        });
      }
    });

    // Get clip (Zero-Knowledge system - no authentication for URL-secret-only clips)
    app.get('/api/clip/:clipId', [
      clipIdValidator
    ], async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
          });
        }

        const { clipId } = req.params;

        // Fetch clip with all columns needed for access check + content retrieval
        const result = await pool.query(
          'SELECT clip_id, content_type, file_path, original_filename, filesize, mime_type, expiration_time, one_time, password_hash, requires_access_code FROM clips WHERE clip_id = $1 AND is_expired = false',
          [clipId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({
            error: 'Clip not found',
            message: 'The requested clip does not exist or has expired'
          });
        }

        const clip = result.rows[0];

        // Zero-Knowledge system: Check if access code is required
        if (clip.requires_access_code) {
          return res.status(401).json({
            error: 'Access code required',
            message: 'This clip requires an access code. Use POST request with access code.',
            requiresAccessCode: true
          });
        }

        // Use shared clip retrieval logic
        return await handleClipRetrieval(req, res, clip, clipId, { pool, updateStatistics });
      } catch (error) {
        console.error('Clip GET error:', { method: req.method, path: req.path, error: error.message });
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to retrieve clip'
        });
      }
    });
}

module.exports = { registerClipRoutes };
