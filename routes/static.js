/*
 * Copyright (C) 2025 Qopy App
 * Static file routes for /clip/ and root assets
 */

const path = require('path');

/**
 * Register static file routes
 * @param {import('express').Application} app
 */
function registerStaticRoutes(app) {
    const publicDir = path.join(__dirname, '..', 'public');

    app.get('/script.js', (req, res) => {
        res.sendFile(path.join(publicDir, 'script.js'));
    });
    app.get('/styles.css', (req, res) => {
        res.sendFile(path.join(publicDir, 'styles.css'));
    });
    app.get('/index.html', (req, res) => {
        res.sendFile(path.join(publicDir, 'index.html'));
    });
    app.get('/admin.html', (req, res) => {
        res.sendFile(path.join(publicDir, 'admin.html'));
    });

    app.get('/clip/script.js', (req, res) => {
        res.sendFile(path.join(publicDir, 'script.js'));
    });
    app.get('/clip/styles.css', (req, res) => {
        res.sendFile(path.join(publicDir, 'styles.css'));
    });
    app.get('/clip/index.html', (req, res) => {
        res.sendFile(path.join(publicDir, 'index.html'));
    });
    app.get('/clip/admin.html', (req, res) => {
        res.sendFile(path.join(publicDir, 'admin.html'));
    });

    app.get('/clip/fonts/Inter-Regular.woff2', (req, res) => {
        res.sendFile(path.join(publicDir, 'fonts', 'Inter-Regular.woff2'));
    });
    app.get('/clip/fonts/Inter-Medium.woff2', (req, res) => {
        res.sendFile(path.join(publicDir, 'fonts', 'Inter-Medium.woff2'));
    });
    app.get('/clip/fonts/Inter-SemiBold.woff2', (req, res) => {
        res.sendFile(path.join(publicDir, 'fonts', 'Inter-SemiBold.woff2'));
    });
    app.get('/clip/fonts/Inter-Bold.woff2', (req, res) => {
        res.sendFile(path.join(publicDir, 'fonts', 'Inter-Bold.woff2'));
    });
    app.get('/clip/fonts/Inter-ExtraBold.woff2', (req, res) => {
        res.sendFile(path.join(publicDir, 'fonts', 'Inter-ExtraBold.woff2'));
    });

    app.get('/qrcode.min.js', (req, res) => {
        res.sendFile(path.join(publicDir, 'qrcode.min.js'));
    });
    app.get('/clip/qrcode.min.js', (req, res) => {
        res.sendFile(path.join(publicDir, 'qrcode.min.js'));
    });

    app.get('/clip/logos/Favicon.png', (req, res) => {
        res.sendFile(path.join(publicDir, 'logos', 'Favicon.png'));
    });
    app.get('/clip/logos/Main Qopy logo.png', (req, res) => {
        res.sendFile(path.join(publicDir, 'logos', 'Main Qopy logo.png'));
    });

    app.get('/favicon.ico', (req, res) => {
        res.sendFile(path.join(publicDir, 'logos', 'Favicon.png'));
    });
    app.get('/apple-touch-icon.png', (req, res) => {
        res.sendFile(path.join(publicDir, 'logos', 'Favicon.png'));
    });
}

module.exports = { registerStaticRoutes };
