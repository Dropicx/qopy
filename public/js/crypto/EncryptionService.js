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

    function isLegacySecret(secret) {
        return secret && secret.length === 16 && /^[A-Za-z0-9]{16}$/.test(secret);
    }

    function isEnhancedPassphrase(secret) {
        return secret && secret.length >= 40;
    }

    async function generateKey(password, urlSecret) {
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
        const key = await generateKey(password, urlSecret);
        const encoder = new TextEncoder();
        const data = typeof content === 'string' ? encoder.encode(content) : content;
        let iv;
        if (password) {
            iv = await deriveIV(password, urlSecret, urlSecret && isEnhancedPassphrase(urlSecret) ? IV_SALT_ENHANCED : IV_SALT_LEGACY);
        } else {
            iv = await deriveIV(urlSecret, null, urlSecret && isEnhancedPassphrase(urlSecret) ? IV_SALT_ENHANCED : IV_SALT_LEGACY);
        }
        const encryptedData = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
        const encryptedBytes = new Uint8Array(encryptedData);
        const combined = new Uint8Array(iv.length + encryptedBytes.length);
        combined.set(iv, 0);
        combined.set(encryptedBytes, iv.length);
        return combined;
    }

    async function encryptChunk(chunkBytes, password, urlSecret) {
        const key = await generateKey(password, urlSecret);
        const chunkArray = chunkBytes instanceof Uint8Array ? chunkBytes : new Uint8Array(chunkBytes);
        let iv;
        if (password) {
            iv = await deriveIV(password, urlSecret, urlSecret && isEnhancedPassphrase(urlSecret) ? IV_SALT_ENHANCED : IV_SALT_LEGACY);
        } else {
            iv = await deriveIV(urlSecret, null, urlSecret && isEnhancedPassphrase(urlSecret) ? IV_SALT_ENHANCED : IV_SALT_LEGACY);
        }
        const encryptedData = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, chunkArray);
        const encryptedBytes = new Uint8Array(encryptedData);
        const combined = new Uint8Array(iv.length + encryptedBytes.length);
        combined.set(iv, 0);
        combined.set(encryptedBytes, iv.length);
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
        const iv = bytes.slice(0, 12);
        const ciphertext = bytes.slice(12);
        const key = await generateKey(password, urlSecret);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
        return new TextDecoder().decode(decrypted);
    }

    global.QopyCrypto = {
        generateKey,
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
        ITERATIONS_ENHANCED
    };
})(typeof window !== 'undefined' ? window : globalThis);
