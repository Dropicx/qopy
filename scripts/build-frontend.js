#!/usr/bin/env node
/**
 * Frontend build script — minifies JS and CSS using esbuild.
 * Output goes to public/dist/ which is served by express.static.
 */
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const publicDir = path.join(__dirname, '..', 'public');
const distDir = path.join(publicDir, 'dist');

// Ensure dist directory exists
fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(path.join(distDir, 'js', 'crypto'), { recursive: true });
fs.mkdirSync(path.join(distDir, 'js', 'standalone'), { recursive: true });

const jsFiles = [
    'script.js',
    'file-upload.js',
    'js/crypto/EncryptionService.js',
    'js/standalone/ErrorMessages.js',
    'js/standalone/UIHelpers.js',
];

const cssFiles = [
    'styles.css',
];

async function build() {
    const startTime = Date.now();

    // Minify JS files (individual, not bundled — they rely on globals)
    for (const file of jsFiles) {
        const entryPoint = path.join(publicDir, file);
        if (!fs.existsSync(entryPoint)) {
            console.warn(`  SKIP ${file} (not found)`);
            continue;
        }
        const outfile = path.join(distDir, file);
        fs.mkdirSync(path.dirname(outfile), { recursive: true });
        await esbuild.build({
            entryPoints: [entryPoint],
            outfile,
            minify: true,
            sourcemap: false,
            target: ['es2020'],
            platform: 'browser',
            bundle: false,
        });
        const origSize = fs.statSync(entryPoint).size;
        const minSize = fs.statSync(outfile).size;
        const pct = ((1 - minSize / origSize) * 100).toFixed(1);
        console.log(`  JS  ${file}: ${(origSize / 1024).toFixed(1)}KB -> ${(minSize / 1024).toFixed(1)}KB (-${pct}%)`);
    }

    // Minify CSS files
    for (const file of cssFiles) {
        const entryPoint = path.join(publicDir, file);
        if (!fs.existsSync(entryPoint)) {
            console.warn(`  SKIP ${file} (not found)`);
            continue;
        }
        const outfile = path.join(distDir, file);
        await esbuild.build({
            entryPoints: [entryPoint],
            outfile,
            minify: true,
            sourcemap: false,
            loader: { '.css': 'css' },
        });
        const origSize = fs.statSync(entryPoint).size;
        const minSize = fs.statSync(outfile).size;
        const pct = ((1 - minSize / origSize) * 100).toFixed(1);
        console.log(`  CSS ${file}: ${(origSize / 1024).toFixed(1)}KB -> ${(minSize / 1024).toFixed(1)}KB (-${pct}%)`);
    }

    const duration = Date.now() - startTime;
    console.log(`\nFrontend build completed in ${duration}ms`);
}

build().catch(err => {
    console.error('Frontend build failed:', err);
    process.exit(1);
});
