#!/usr/bin/env node

/**
 * Test script for client-side encryption
 * This simulates the encryption/decryption process
 */

const crypto = require('crypto');

// Simulate Web Crypto API functions
class MockWebCrypto {
    constructor() {
        this.algorithm = 'AES-256-GCM';
    }

    async generateKey(algorithm, extractable, keyUsages) {
        const key = crypto.randomBytes(32);
        return {
            key,
            algorithm,
            extractable,
            keyUsages
        };
    }

    async deriveKey(algorithm, baseKey, derivedKeyAlgorithm, extractable, keyUsages) {
        const { password, salt, iterations, hash } = algorithm;
        const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, 32, hash);
        return {
            key: derivedKey,
            algorithm: derivedKeyAlgorithm,
            extractable,
            keyUsages
        };
    }

    async importKey(format, keyData, algorithm, extractable, keyUsages) {
        return {
            key: keyData,
            algorithm,
            extractable,
            keyUsages
        };
    }

    async exportKey(format, key) {
        return key.key;
    }

    async encrypt(algorithm, key, data) {
        const { iv } = algorithm;
        const cipher = crypto.createCipherGCM('aes-256-gcm', key.key);
        cipher.setAAD(Buffer.alloc(0));
        const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
        const authTag = cipher.getAuthTag();
        return Buffer.concat([encrypted, authTag]);
    }

    async decrypt(algorithm, key, data) {
        const { iv } = algorithm;
        const decipher = crypto.createDecipherGCM('aes-256-gcm', key.key);
        decipher.setAAD(Buffer.alloc(0));
        decipher.setAuthTag(data.slice(-16));
        const decrypted = Buffer.concat([decipher.update(data.slice(0, -16)), decipher.final()]);
        return decrypted;
    }

    getRandomValues(array) {
        const randomBytes = crypto.randomBytes(array.length);
        for (let i = 0; i < array.length; i++) {
            array[i] = randomBytes[i];
        }
        return array;
    }
}

// Mock global crypto object
global.crypto = new MockWebCrypto();
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;

// Test encryption functions
async function testEncryption() {
    console.log('🔐 Testing Client-Side Encryption...\n');

    // Test 1: Encrypt without password
    console.log('1️⃣ Testing encryption without password:');
    const content1 = 'Hello, this is a test message!';
    const encrypted1 = await encryptContent(content1);
    console.log(`   Original: "${content1}"`);
    console.log(`   Encrypted: ${encrypted1.substring(0, 50)}...`);
    
    const decrypted1 = await decryptContent(encrypted1);
    console.log(`   Decrypted: "${decrypted1}"`);
    console.log(`   ✅ Match: ${content1 === decrypted1 ? 'YES' : 'NO'}\n`);

    // Test 2: Encrypt with password
    console.log('2️⃣ Testing encryption with password:');
    const content2 = 'Secret message with password protection!';
    const password = 'mySecretPassword123';
    const encrypted2 = await encryptContent(content2, password);
    console.log(`   Original: "${content2}"`);
    console.log(`   Encrypted: ${encrypted2.substring(0, 50)}...`);
    
    const decrypted2 = await decryptContent(encrypted2, password);
    console.log(`   Decrypted: "${decrypted2}"`);
    console.log(`   ✅ Match: ${content2 === decrypted2 ? 'YES' : 'NO'}\n`);

    // Test 3: Wrong password
    console.log('3️⃣ Testing wrong password:');
    try {
        const wrongDecrypted = await decryptContent(encrypted2, 'wrongPassword');
        console.log(`   ❌ Should have failed, but got: "${wrongDecrypted}"`);
    } catch (error) {
        console.log(`   ✅ Correctly failed with: ${error.message}`);
    }
    console.log('');

    // Test 4: Detect encrypted content
    console.log('4️⃣ Testing encryption detection:');
    console.log(`   Is encrypted1 encrypted? ${isEncrypted(encrypted1)}`);
    console.log(`   Is content1 encrypted? ${isEncrypted(content1)}`);
    console.log(`   Is encrypted2 encrypted? ${isEncrypted(encrypted2)}`);
    console.log('');

    console.log('🎉 All encryption tests completed!');
}

// Encryption functions (copied from script.js)
async function generateKey(password = null) {
    if (!global.crypto || !global.crypto.subtle) {
        throw new Error('Web Crypto API not available. Please use HTTPS.');
    }
    
    if (password) {
        const encoder = new TextEncoder();
        const salt = encoder.encode('qopy-salt-v1');
        const keyMaterial = await global.crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveBits', 'deriveKey']
        );
        return await global.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    } else {
        return await global.crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
    }
}

async function encryptContent(content, password = null) {
    try {
        if (isEncrypted(content)) {
            return content;
        }
        
        const key = await generateKey(password);
        const encoder = new TextEncoder();
        const data = encoder.encode(content);
        
        const iv = global.crypto.getRandomValues(new Uint8Array(12));
        
        const encryptedData = await global.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            data
        );
        
        let keyData = null;
        if (!password) {
            keyData = await global.crypto.subtle.exportKey('raw', key);
        }
        
        const result = {
            iv: Array.from(iv),
            data: Array.from(new Uint8Array(encryptedData)),
            key: keyData ? Array.from(keyData) : null
        };
        
        return Buffer.from(JSON.stringify(result)).toString('base64');
    } catch (error) {
        console.error('Encryption error:', error);
        throw new Error('Failed to encrypt content');
    }
}

async function decryptContent(encryptedContent, password = null) {
    try {
        if (!isEncrypted(encryptedContent)) {
            return encryptedContent;
        }
        
        const encrypted = JSON.parse(Buffer.from(encryptedContent, 'base64').toString());
        
        let key;
        if (password) {
            key = await generateKey(password);
        } else if (encrypted.key) {
            key = await global.crypto.subtle.importKey(
                'raw',
                new Uint8Array(encrypted.key),
                { name: 'AES-GCM', length: 256 },
                false,
                ['decrypt']
            );
        } else {
            throw new Error('No key available for decryption');
        }
        
        const decryptedData = await global.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(encrypted.iv) },
            key,
            new Uint8Array(encrypted.data)
        );
        
        const decoder = new TextDecoder();
        return decoder.decode(decryptedData);
    } catch (error) {
        console.error('Decryption error:', error);
        throw new Error('Failed to decrypt content. The content may be corrupted or the password is incorrect.');
    }
}

function isEncrypted(content) {
    try {
        const parsed = JSON.parse(Buffer.from(content, 'base64').toString());
        return parsed && typeof parsed === 'object' && parsed.iv && parsed.data;
    } catch {
        return false;
    }
}

// Run tests
testEncryption().catch(console.error); 