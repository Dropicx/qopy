/*
 * Copyright (C) 2025 Qopy App
 * Health check routes
 */

/**
 * Register health check routes
 * @param {import('express').Application} app
 * @param {{ pool: import('pg').Pool }} deps
 */
function registerHealthRoutes(app, { pool }) {
    app.get('/health', async (req, res) => {
        try {
            await pool.query('SELECT NOW() as current_time');
            res.status(200).json({
                status: 'OK',
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                version: 'minimal-1.0.0',
                database: 'connected'
            });
        } catch (error) {
            console.error('❌ Health check failed:', error.message);
            res.status(503).json({
                status: 'ERROR',
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                version: 'minimal-1.0.0',
                database: 'disconnected',
                error: 'Database health check failed'
            });
        }
    });

    app.get('/api/health', (req, res) => {
        res.status(200).json({
            status: 'OK',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            version: 'minimal-1.0.0'
        });
    });

    app.get('/ping', (req, res) => {
        res.json({
            pong: true,
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    });
}

module.exports = { registerHealthRoutes };
