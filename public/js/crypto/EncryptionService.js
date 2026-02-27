/*
 * Copyright (C) 2025 Qopy App
 * Shared client-side encryption - used by script.js and file-upload.js
 * Supports legacy (16-char URL secret) and enhanced (40+ char passphrase) formats
 */

(function (global) {
    'use strict';

    const SALT_LEGACY = 'qopy-salt-v1';
    const SALT_ENHANCED = 'qopy-enhanced-salt-v2';
    const IV_SALT_LEGACY = 'qopy-iv-salt-v1';
    const IV_SALT_ENHANCED = 'qopy-enhanced-iv-salt-v2';
    const ITERATIONS_LEGACY = 100000;
    const ITERATIONS_ENHANCED = 250000;
    const ITERATIONS_V3 = 600000;

    // V3 format: [version:1 byte (0x03)][salt:32 bytes][IV:12 bytes][ciphertext]
    // V2/legacy format: [IV:12 bytes][ciphertext]
    const FORMAT_VERSION_V3 = 0x03;
    const SALT_LENGTH_V3 = 32;
    const IV_LENGTH = 12;
    const V3_HEADER_LENGTH = 1 + SALT_LENGTH_V3 + IV_LENGTH; // 45 bytes

    function isLegacySecret(secret) {
        return secret && secret.length === 16 && /^[A-Za-z0-9]{16}$/.test(secret);
    }

    function isEnhancedPassphrase(secret) {
        return secret && secret.length >= 40;
    }

    // Generate key for legacy/enhanced formats (backward compatibility)
    async function generateKeyLegacy(password, urlSecret) {
        const encoder = new TextEncoder();
        let keyMaterial;
        let salt;
        let iterations;

        if (password && urlSecret) {
            const combined = urlSecret + ':' + password;
            if (isLegacySecret(urlSecret)) {
                salt = SALT_LEGACY;
                iterations = ITERATIONS_LEGACY;
            } else if (isEnhancedPassphrase(urlSecret)) {
                salt = SALT_ENHANCED;
                iterations = ITERATIONS_ENHANCED;
            } else {
                throw new Error('Invalid secret format');
            }
            keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(combined), 'PBKDF2', false, ['deriveKey']);
        } else if (urlSecret) {
            if (isLegacySecret(urlSecret)) {
                salt = SALT_LEGACY;
                iterations = ITERATIONS_LEGACY;
            } else if (isEnhancedPassphrase(urlSecret)) {
                salt = SALT_ENHANCED;
                iterations = ITERATIONS_ENHANCED;
            } else {
                throw new Error('Invalid secret format');
            }
            keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(urlSecret), 'PBKDF2', false, ['deriveKey']);
        } else {
            throw new Error('Either password or urlSecret must be provided');
        }

        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: encoder.encode(salt), iterations, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    // Generate key for V3 format with per-clip random salt and 600k iterations
    async function generateKeyV3(password, urlSecret, saltBytes) {
        const encoder = new TextEncoder();
        let secret;
        if (password && urlSecret) {
            secret = urlSecret + ':' + password;
        } else if (urlSecret) {
            secret = urlSecret;
        } else {
            throw new Error('Either password or urlSecret must be provided');
        }

        const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveKey']);
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: saltBytes, iterations: ITERATIONS_V3, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    // Default generateKey: delegates to legacy for backward compat
    async function generateKey(password, urlSecret) {
        return generateKeyLegacy(password, urlSecret);
    }

    async function deriveIV(primarySecret, secondarySecret, salt) {
        const encoder = new TextEncoder();
        let combinedSecret = primarySecret;
        if (secondarySecret) {
            combinedSecret = secondarySecret + ':' + primarySecret;
        }
        const saltStr = salt || IV_SALT_LEGACY;
        let iterations = ITERATIONS_LEGACY;
        if (isEnhancedPassphrase(primarySecret) || (secondarySecret && isEnhancedPassphrase(secondarySecret))) {
            iterations = 100000;
        }
        const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(combinedSecret), 'PBKDF2', false, ['deriveBits']);
        const ivBytes = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt: encoder.encode(saltStr), iterations, hash: 'SHA-256' },
            keyMaterial,
            96
        );
        return new Uint8Array(ivBytes);
    }

    async function generateCompatibleSecret(enhanced) {
        if (enhanced) {
            const entropyBytes = new Uint8Array(32);
            crypto.getRandomValues(entropyBytes);
            return btoa(String.fromCharCode.apply(null, entropyBytes));
        }
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 16; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    async function encryptContent(content, password, urlSecret) {
        const encoder = new TextEncoder();
        const data = typeof content === 'string' ? encoder.encode(content) : content;

        // V3 format: random salt, random IV, 600k iterations
        const salt = new Uint8Array(SALT_LENGTH_V3);
        crypto.getRandomValues(salt);
        const iv = new Uint8Array(IV_LENGTH);
        crypto.getRandomValues(iv);

        const key = await generateKeyV3(password, urlSecret, salt);
        const encryptedData = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
        const encryptedBytes = new Uint8Array(encryptedData);

        // V3 payload: [version:1][salt:32][IV:12][ciphertext]
        const combined = new Uint8Array(1 + salt.length + iv.length + encryptedBytes.length);
        combined[0] = FORMAT_VERSION_V3;
        combined.set(salt, 1);
        combined.set(iv, 1 + salt.length);
        combined.set(encryptedBytes, 1 + salt.length + iv.length);
        return combined;
    }

    async function encryptChunk(chunkBytes, password, urlSecret) {
        const chunkArray = chunkBytes instanceof Uint8Array ? chunkBytes : new Uint8Array(chunkBytes);

        // V3 format: random salt, random IV, 600k iterations
        const salt = new Uint8Array(SALT_LENGTH_V3);
        crypto.getRandomValues(salt);
        const iv = new Uint8Array(IV_LENGTH);
        crypto.getRandomValues(iv);

        const key = await generateKeyV3(password, urlSecret, salt);
        const encryptedData = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, chunkArray);
        const encryptedBytes = new Uint8Array(encryptedData);

        // V3 payload: [version:1][salt:32][IV:12][ciphertext]
        const combined = new Uint8Array(1 + salt.length + iv.length + encryptedBytes.length);
        combined[0] = FORMAT_VERSION_V3;
        combined.set(salt, 1);
        combined.set(iv, 1 + salt.length);
        combined.set(encryptedBytes, 1 + salt.length + iv.length);
        return combined;
    }

    function isEncrypted(content) {
        try {
            if (content instanceof Uint8Array) return content.length >= 20;
            if (Array.isArray(content)) return content.length >= 20;
            if (typeof content === 'string' && content.length >= 20) {
                const decoded = atob(content);
                return decoded.length >= 20;
            }
            return false;
        } catch {
            return false;
        }
    }

    async function decryptContent(encryptedContent, password, urlSecret) {
        if (!encryptedContent) throw new Error('Encrypted content required');
        let bytes;
        if (encryptedContent instanceof Uint8Array) {
            bytes = encryptedContent;
        } else if (Array.isArray(encryptedContent)) {
            bytes = new Uint8Array(encryptedContent);
        } else if (typeof encryptedContent === 'string') {
            const decoded = atob(encryptedContent);
            bytes = new Uint8Array(decoded.length);
            for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
        } else {
            throw new Error('Invalid encrypted content format');
        }
        if (bytes.length < 20) {
            throw new Error('Content too short to be encrypted');
        }

        let iv, ciphertext, key;
        if (bytes[0] === FORMAT_VERSION_V3 && bytes.length >= V3_HEADER_LENGTH + 16) {
            // V3 format: [version:1][salt:32][IV:12][ciphertext]
            const salt = bytes.slice(1, 1 + SALT_LENGTH_V3);
            iv = bytes.slice(1 + SALT_LENGTH_V3, V3_HEADER_LENGTH);
            ciphertext = bytes.slice(V3_HEADER_LENGTH);
            key = await generateKeyV3(password, urlSecret, salt);
        } else {
            // Legacy format: [IV:12][ciphertext]
            iv = bytes.slice(0, 12);
            ciphertext = bytes.slice(12);
            key = await generateKeyLegacy(password, urlSecret);
        }

        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
        return new TextDecoder().decode(decrypted);
    }

    global.QopyCrypto = {
        generateKey,
        generateKeyLegacy,
        generateKeyV3,
        deriveIV,
        generateCompatibleSecret,
        encryptContent,
        encryptChunk,
        decryptContent,
        isEncrypted,
        isLegacySecret,
        isEnhancedPassphrase,
        SALT_LEGACY,
        SALT_ENHANCED,
        IV_SALT_LEGACY,
        IV_SALT_ENHANCED,
        ITERATIONS_LEGACY,
        ITERATIONS_ENHANCED,
        ITERATIONS_V3,
        FORMAT_VERSION_V3,
        SALT_LENGTH_V3,
        IV_LENGTH,
        V3_HEADER_LENGTH
    };
})(typeof window !== 'undefined' ? window : globalThis);
