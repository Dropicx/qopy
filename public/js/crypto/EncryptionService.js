/*
 * Copyright (C) 2025 Qopy App
 * Shared client-side encryption - used by script.js and file-upload.js
 * V3 only: random salt, random IV, 600k PBKDF2 iterations (OWASP 2025)
 */

(function (global) {
    'use strict';

    const ITERATIONS_V3 = 600000;

    // V3 format: [version:1 byte (0x03)][salt:32 bytes][IV:12 bytes][ciphertext]
    const FORMAT_VERSION_V3 = 0x03;
    const SALT_LENGTH_V3 = 32;
    const IV_LENGTH = 12;
    const V3_HEADER_LENGTH = 1 + SALT_LENGTH_V3 + IV_LENGTH; // 45 bytes

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

    async function generateCompatibleSecret() {
        const entropyBytes = new Uint8Array(32);
        crypto.getRandomValues(entropyBytes);
        return btoa(String.fromCharCode.apply(null, entropyBytes));
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
            throw new Error('Unsupported encryption format (legacy V1/V2 no longer supported)');
        }

        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
        return new TextDecoder().decode(decrypted);
    }

    global.QopyCrypto = {
        generateKeyV3,
        generateCompatibleSecret,
        encryptContent,
        encryptChunk,
        decryptContent,
        isEncrypted,
        ITERATIONS_V3,
        FORMAT_VERSION_V3,
        SALT_LENGTH_V3,
        IV_LENGTH,
        V3_HEADER_LENGTH
    };
})(typeof window !== 'undefined' ? window : globalThis);
