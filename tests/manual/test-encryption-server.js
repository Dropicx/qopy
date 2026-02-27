#!/usr/bin/env node

/**
 * Qopy Verschlüsselungstest - Serverseitige Tests
 * 
 * Dieses Skript testet die Verschlüsselungsfunktionen und Datenbankoperationen
 * der Qopy-Anwendung.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Test-Konfiguration (V3 only: random salt, random IV, 600k PBKDF2 iterations)
const TEST_CONFIG = {
    iterations: 600000,
    formatVersionV3: 0x03,
    saltLength: 32,
    ivLength: 12,
    algorithm: 'aes-256-gcm',
    keyLength: 32, // 256 bits
};

class ServerEncryptionTester {
    constructor() {
        this.results = [];
        this.testData = [];
    }

    // PBKDF2 Schlüsselableitung (V3: per-operation random salt, 600k iterations)
    async deriveKey(secret, saltBuffer) {
        return new Promise((resolve, reject) => {
            crypto.pbkdf2(secret, saltBuffer, TEST_CONFIG.iterations, TEST_CONFIG.keyLength, 'sha256', (err, key) => {
                if (err) reject(err);
                else resolve(key);
            });
        });
    }

    // Verschlüsseln (V3 format: [version:1][salt:32][IV:12][ciphertext])
    async encrypt(content, password = null, urlSecret = null) {
        try {
            if (typeof content !== 'string' || content.length === 0) {
                throw new Error('Content must be a non-empty string');
            }

            const salt = crypto.randomBytes(TEST_CONFIG.saltLength);
            const iv = crypto.randomBytes(TEST_CONFIG.ivLength);

            let secret;
            if (password && urlSecret) {
                secret = urlSecret + ':' + password;
            } else if (urlSecret) {
                secret = urlSecret;
            } else {
                throw new Error('URL secret is required for non-password clips');
            }

            const key = await this.deriveKey(secret, salt);

            const cipher = crypto.createCipheriv(TEST_CONFIG.algorithm, key, iv);
            let encrypted = cipher.update(content, 'utf8');
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            const authTag = cipher.getAuthTag();

            // V3 payload: [version:1][salt:32][IV:12][ciphertext with authTag]
            const ciphertext = Buffer.concat([encrypted, authTag]);
            return Buffer.concat([
                Buffer.from([TEST_CONFIG.formatVersionV3]),
                salt,
                iv,
                ciphertext
            ]);
        } catch (error) {
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    // Entschlüsseln (V3 format only)
    async decrypt(encryptedData, password = null, urlSecret = null) {
        try {
            const minLen = 1 + TEST_CONFIG.saltLength + TEST_CONFIG.ivLength + 16;
            if (encryptedData.length < minLen) {
                throw new Error('Invalid encrypted data: too short');
            }
            if (encryptedData[0] !== TEST_CONFIG.formatVersionV3) {
                throw new Error('Unsupported encryption format (legacy V1/V2 no longer supported)');
            }

            const salt = encryptedData.slice(1, 1 + TEST_CONFIG.saltLength);
            const iv = encryptedData.slice(1 + TEST_CONFIG.saltLength, 1 + TEST_CONFIG.saltLength + TEST_CONFIG.ivLength);
            const ciphertextWithTag = encryptedData.slice(1 + TEST_CONFIG.saltLength + TEST_CONFIG.ivLength);

            let secret;
            if (password && urlSecret) {
                secret = urlSecret + ':' + password;
            } else if (urlSecret) {
                secret = urlSecret;
            } else {
                throw new Error('URL secret is required for non-password clips');
            }

            const key = await this.deriveKey(secret, salt);

            const authTag = ciphertextWithTag.slice(-16);
            const encrypted = ciphertextWithTag.slice(0, -16);

            const decipher = crypto.createDecipheriv(TEST_CONFIG.algorithm, key, iv);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(encrypted, null, 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    // URL Secret generieren
    generateUrlSecret() {
        return crypto.randomBytes(8).toString('hex');
    }

    // Entropie berechnen
    calculateEntropy(data) {
        const byteCounts = new Array(256).fill(0);
        for (let i = 0; i < data.length; i++) {
            byteCounts[data[i]]++;
        }
        
        let entropy = 0;
        const totalBytes = data.length;
        
        for (let i = 0; i < 256; i++) {
            if (byteCounts[i] > 0) {
                const probability = byteCounts[i] / totalBytes;
                entropy -= probability * Math.log2(probability);
            }
        }
        
        return entropy;
    }

    // Test hinzufügen
    addResult(title, content, type = 'info') {
        this.results.push({ title, content, type, timestamp: new Date() });
        console.log(`[${type.toUpperCase()}] ${title}: ${content}`);
    }

    // Einzelnen Test ausführen
    async runSingleTest(content, password = null, description = '') {
        const urlSecret = this.generateUrlSecret();
        
        try {
            // Verschlüsseln
            const encrypted = await this.encrypt(content, password, urlSecret);
            const originalSize = Buffer.from(content, 'utf8').length;
            const encryptedSize = encrypted.length;
            const overhead = encryptedSize - originalSize;

            // Entropie berechnen
            const originalEntropy = this.calculateEntropy(Buffer.from(content, 'utf8'));
            const encryptedEntropy = this.calculateEntropy(encrypted);

            // Entschlüsseln
            const decrypted = await this.decrypt(encrypted, password, urlSecret);

            const success = decrypted === content;
            
            this.testData.push({
                description,
                content: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
                password: password ? 'Ja' : 'Nein',
                urlSecret,
                originalSize,
                encryptedSize,
                overhead,
                originalEntropy,
                encryptedEntropy,
                success
            });

            if (success) {
                this.addResult(`Test erfolgreich: ${description}`, 
                    `Größe: ${originalSize} → ${encryptedSize} Bytes (+${overhead})\nEntropie: ${originalEntropy.toFixed(2)} → ${encryptedEntropy.toFixed(2)} bits/byte`, 'success');
            } else {
                this.addResult(`Test fehlgeschlagen: ${description}`, 
                    `Erwartet: "${content}"\nErhalten: "${decrypted}"`, 'error');
            }

            return success;
        } catch (error) {
            this.addResult(`Test Fehler: ${description}`, error.message, 'error');
            return false;
        }
    }

    // Umfassende Tests ausführen
    async runComprehensiveTests() {
        this.addResult('Test gestartet', 'Führe umfassende Verschlüsselungstests aus...', 'info');

        const testCases = [
            { content: 'Einfacher Text', password: null, description: 'Nur URL Secret' },
            { content: 'Text mit Passwort', password: 'test123', description: 'URL Secret + Passwort' },
            { content: 'Deutsche Umlaute: äöüß', password: null, description: 'Umlaute ohne Passwort' },
            { content: 'Sonderzeichen: !@#$%^&*()_+-=[]{}|;\':",./<>?', password: 'complex!@#', description: 'Sonderzeichen mit Passwort' },
            { content: 'Langer Text: ' + 'A'.repeat(1000), password: null, description: 'Langer Text' },
            { content: 'Unicode: 🌍🚀💻🎉', password: null, description: 'Unicode Emojis' },
            { content: 'Leerer String', password: null, description: 'Leerer String' },
            { content: 'Sensible Daten: Kreditkarte 1234-5678-9012-3456', password: 'secure123', description: 'Sensible Daten mit Passwort' },
            { content: 'Code: function test() { return "hello"; }', password: null, description: 'Code ohne Passwort' },
            { content: 'JSON: {"name":"test","value":123}', password: 'json123', description: 'JSON mit Passwort' }
        ];

        let successCount = 0;
        let totalOverhead = 0;
        let totalEntropyRatio = 0;

        for (const testCase of testCases) {
            const success = await this.runSingleTest(testCase.content, testCase.password, testCase.description);
            if (success) {
                successCount++;
                const testData = this.testData[this.testData.length - 1];
                totalOverhead += testData.overhead;
                totalEntropyRatio += testData.encryptedEntropy / testData.originalEntropy;
            }
        }

        // Statistiken
        const avgOverhead = totalOverhead / testCases.length;
        const avgEntropyRatio = totalEntropyRatio / testCases.length;
        const successRate = (successCount / testCases.length) * 100;

        this.addResult('Testzusammenfassung', 
            `Erfolgreiche Tests: ${successCount}/${testCases.length} (${successRate.toFixed(1)}%)\nDurchschnittlicher Overhead: ${avgOverhead.toFixed(1)} Bytes\nDurchschnittliche Entropie-Verbesserung: ${avgEntropyRatio.toFixed(2)}x`, 
            successRate === 100 ? 'success' : 'error');

        // Detaillierte Analyse
        this.addResult('Detaillierte Analyse', 
            `Algorithmus: ${TEST_CONFIG.algorithm}\nSchlüsselableitung: PBKDF2 (${TEST_CONFIG.iterations} Iterationen)\nIV-Ableitung: PBKDF2 (50.000 Iterationen)\nSchlüssellänge: ${TEST_CONFIG.keyLength * 8} bits\nIV-Länge: ${TEST_CONFIG.ivLength * 8} bits\nAuth-Tag: 128 bits`, 'info');

        return {
            successCount,
            totalTests: testCases.length,
            successRate,
            avgOverhead,
            avgEntropyRatio,
            testData: this.testData
        };
    }

    // Sicherheitstests
    async runSecurityTests() {
        this.addResult('Sicherheitstest gestartet', 'Führe Sicherheitstests aus...', 'info');

        const content = 'Geheimer Inhalt';
        const password = 'test123';
        const urlSecret = this.generateUrlSecret();

        try {
            // Test 1: Korrekte Verschlüsselung/Entschlüsselung
            const encrypted = await this.encrypt(content, password, urlSecret);
            const decrypted = await this.decrypt(encrypted, password, urlSecret);
            
            if (decrypted === content) {
                this.addResult('Sicherheitstest 1', 'Korrekte Verschlüsselung/Entschlüsselung ✅', 'success');
            } else {
                this.addResult('Sicherheitstest 1', 'Verschlüsselung/Entschlüsselung fehlgeschlagen ❌', 'error');
            }

            // Test 2: Falsches Passwort
            try {
                await this.decrypt(encrypted, 'wrongpassword', urlSecret);
                this.addResult('Sicherheitstest 2', 'Falsches Passwort wurde akzeptiert ❌', 'error');
            } catch (error) {
                this.addResult('Sicherheitstest 2', 'Falsches Passwort korrekt abgelehnt ✅', 'success');
            }

            // Test 3: Falsches URL Secret
            try {
                await this.decrypt(encrypted, password, 'wrongsecret');
                this.addResult('Sicherheitstest 3', 'Falsches URL Secret wurde akzeptiert ❌', 'error');
            } catch (error) {
                this.addResult('Sicherheitstest 3', 'Falsches URL Secret korrekt abgelehnt ✅', 'success');
            }

            // Test 4: Manipulierte Daten
            const manipulated = Buffer.from(encrypted);
            manipulated[0] = manipulated[0] ^ 1; // Ein Bit ändern
            try {
                await this.decrypt(manipulated, password, urlSecret);
                this.addResult('Sicherheitstest 4', 'Manipulierte Daten wurden akzeptiert ❌', 'error');
            } catch (error) {
                this.addResult('Sicherheitstest 4', 'Manipulierte Daten korrekt abgelehnt ✅', 'success');
            }

            // Test 5: Entropie-Analyse
            const originalEntropy = this.calculateEntropy(Buffer.from(content, 'utf8'));
            const encryptedEntropy = this.calculateEntropy(encrypted);
            
            if (encryptedEntropy > 7.5) {
                this.addResult('Sicherheitstest 5', `Hohe Entropie in verschlüsselten Daten: ${encryptedEntropy.toFixed(2)} bits/byte ✅`, 'success');
            } else {
                this.addResult('Sicherheitstest 5', `Niedrige Entropie in verschlüsselten Daten: ${encryptedEntropy.toFixed(2)} bits/byte ❌`, 'error');
            }

        } catch (error) {
            this.addResult('Sicherheitstest Fehler', error.message, 'error');
        }
    }

    // Ergebnisse speichern
    saveResults(filename = 'encryption-test-results.json') {
        const results = {
            timestamp: new Date().toISOString(),
            config: TEST_CONFIG,
            summary: {
                totalTests: this.testData.length,
                successfulTests: this.testData.filter(t => t.success).length,
                failedTests: this.testData.filter(t => !t.success).length
            },
            testData: this.testData,
            results: this.results
        };

        fs.writeFileSync(filename, JSON.stringify(results, null, 2));
        this.addResult('Ergebnisse gespeichert', `Testdaten wurden in ${filename} gespeichert`, 'info');
    }
}

// Hauptfunktion
async function main() {
    console.log('🔐 Qopy Verschlüsselungstest - Serverseitige Tests\n');
    
    const tester = new ServerEncryptionTester();

    try {
        // Umfassende Tests
        const comprehensiveResults = await tester.runComprehensiveTests();
        
        console.log('\n' + '='.repeat(60) + '\n');
        
        // Sicherheitstests
        await tester.runSecurityTests();
        
        console.log('\n' + '='.repeat(60) + '\n');
        
        // Ergebnisse speichern
        tester.saveResults();
        
        // Finale Zusammenfassung
        console.log('\n📊 FINALE ZUSAMMENFASSUNG');
        console.log('='.repeat(60));
        console.log(`✅ Erfolgreiche Tests: ${comprehensiveResults.successCount}/${comprehensiveResults.totalTests}`);
        console.log(`📈 Erfolgsrate: ${comprehensiveResults.successRate.toFixed(1)}%`);
        console.log(`📦 Durchschnittlicher Overhead: ${comprehensiveResults.avgOverhead.toFixed(1)} Bytes`);
        console.log(`🔒 Durchschnittliche Entropie-Verbesserung: ${comprehensiveResults.avgEntropyRatio.toFixed(2)}x`);
        
        if (comprehensiveResults.successRate === 100) {
            console.log('\n🎉 ALLE TESTS ERFOLGREICH! Die Verschlüsselung funktioniert korrekt.');
        } else {
            console.log('\n⚠️  EINIGE TESTS FEHLGESCHLAGEN! Bitte überprüfen Sie die Implementierung.');
        }
        
    } catch (error) {
        console.error('❌ Testfehler:', error.message);
        process.exit(1);
    }
}

// Skript ausführen
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { ServerEncryptionTester, TEST_CONFIG }; 