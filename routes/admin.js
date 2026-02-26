/*
 * Copyright (C) 2025 Qopy App
 * Admin routes
 */

const crypto = require('crypto');
const path = require('path');
const { body, validationResult } = require('express-validator');

/**
 * Admin authentication middleware
 * Validates Bearer token in Authorization header against ADMIN_TOKEN env var
 */
function requireAdminAuth(req, res, next) {
  const adminToken = process.env.ADMIN_TOKEN;

  if (!adminToken) {
    return res.status(500).json({
      error: 'Admin authentication not configured',
      message: 'Please set ADMIN_TOKEN environment variable'
    });
  }

  // For API requests, check Authorization header
  if (req.path.startsWith('/api/admin/')) {
    const authHeader = req.headers.authorization;
    const expected = `Bearer ${adminToken}`;
    if (!authHeader || authHeader.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid admin token'
      });
    }
  }

  next();
}

/**
 * Register admin routes
 * @param {import('express').Application} app
 * @param {{ pool: import('pg').Pool }} deps
 */
function registerAdminRoutes(app, { pool }) {
    // Admin authentication endpoint
    app.post('/api/admin/auth', [
      body('password').isLength({ min: 1, max: 128 }).withMessage('Password is required')
    ], async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
          });
        }

        const { password } = req.body;
        const adminToken = process.env.ADMIN_TOKEN;

        if (!adminToken) {
          return res.status(500).json({
            error: 'Admin authentication not configured',
            message: 'Please set ADMIN_TOKEN environment variable'
          });
        }

        const pwBuf = Buffer.from(String(password));
        const tkBuf = Buffer.from(String(adminToken));
        if (pwBuf.length === tkBuf.length && crypto.timingSafeEqual(pwBuf, tkBuf)) {
          res.json({
            success: true,
            message: 'Authentication successful'
          });
        } else {
          res.status(401).json({
            error: 'Authentication failed',
            message: 'Invalid admin password'
          });
        }
      } catch (error) {
        res.status(500).json({
          error: 'Internal server error',
          message: 'Authentication failed'
        });
      }
    });

    // Admin dashboard page
    app.get('/admin', (req, res) => {
      // Check if admin token is configured
      if (!process.env.ADMIN_TOKEN) {
        return res.status(500).send(`
          <html>
            <head><title>Admin Not Configured</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1>🔧 Admin Dashboard Not Configured</h1>
              <p>The ADMIN_TOKEN environment variable is not set.</p>
              <p>Please configure the admin token in your Railway environment variables.</p>
            </body>
          </html>
        `);
      }
      res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
    });

    // Protected Admin statistics
    app.get('/api/admin/stats', requireAdminAuth, async (req, res) => {
      try {
        // Get statistics from dedicated table (much faster than COUNT queries)
        const statsResult = await pool.query('SELECT * FROM statistics ORDER BY id DESC LIMIT 1');
        const stats = statsResult.rows[0];

        // Get active clips (not expired) - still need to query clips table for this
        const activeResult = await pool.query('SELECT COUNT(*) as count FROM clips WHERE is_expired = false');
        const activeClips = parseInt(activeResult.rows[0].count);

        // Calculate percentages
        const totalClips = parseInt(stats.total_clips);
        const passwordPercentage = totalClips > 0 ? Math.round((parseInt(stats.password_protected_clips) / totalClips) * 100) : 0;
        const quickSharePercentage = totalClips > 0 ? Math.round((parseInt(stats.quick_share_clips) / totalClips) * 100) : 0;

        res.json({
          totalClips,
          activeClips,
          totalAccesses: parseInt(stats.total_accesses),
          passwordClips: parseInt(stats.password_protected_clips),
          passwordPercentage,
          quickShareClips: parseInt(stats.quick_share_clips),
          quickSharePercentage,
          oneTimeClips: parseInt(stats.one_time_clips),
          normalClips: parseInt(stats.normal_clips),
          lastUpdated: stats.last_updated
        });
      } catch (error) {
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to get statistics'
        });
      }
    });

    // Protected Admin recent clips
    app.get('/api/admin/clips', requireAdminAuth, async (req, res) => {
      try {
        const result = await pool.query(`
          SELECT clip_id, created_at, expiration_time, is_expired,
                 access_count, password_hash IS NOT NULL as has_password, one_time
          FROM clips
          ORDER BY created_at DESC
          LIMIT 20
        `);

        res.json(result.rows);
      } catch (error) {
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to get clips'
        });
      }
    });

    // Protected Admin system info
    app.get('/api/admin/system', requireAdminAuth, async (req, res) => {
      try {
        // Test database connection
        const dbTest = await pool.query('SELECT NOW() as current_time');

        res.json({
          status: 'OK',
          version: 'minimal-1.0.0',
          environment: process.env.NODE_ENV || 'production',
          database: 'Connected',
          lastCleanup: new Date().toLocaleString(),
          currentTime: dbTest.rows[0].current_time
        });
      } catch (error) {
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to get system information'
        });
      }
    });
}

module.exports = { registerAdminRoutes, requireAdminAuth };
