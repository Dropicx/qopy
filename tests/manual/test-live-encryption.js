#!/usr/bin/env node

/**
 * Qopy Live-Verschlüsselungstest
 * 
 * Dieses Skript testet die Live-Qopy-Anwendung, um zu verifizieren,
 * dass die Verschlüsselung in der Praxis funktioniert.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

class LiveEncryptionTester {
    constructor(baseUrl = 'http://localhost:8080') {
        this.baseUrl = baseUrl;
        this.results = [];
        this.testData = [];
    }

    // HTTP Request Helper
    async makeRequest(path, method = 'GET', data = null, headers = {}) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.baseUrl);
            const isHttps = url.protocol === 'https:';
            const client = isHttps ? https : http;
            
            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Qopy-Encryption-Tester/1.0',
                    ...headers
                }
            };

            const req = client.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => {
                    body += chunk;
                });
                res.on('end', () => {
                    try {
                        const jsonBody = JSON.parse(body);
                        resolve({
                            status: res.statusCode,
                            headers: res.headers,
                            data: jsonBody
                        });
                    } catch (error) {
                        resolve({
                            status: res.statusCode,
                            headers: res.headers,
                            data: body
                        });
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (data) {
                req.write(JSON.stringify(data));
            }

            req.end();
        });
    }

    // Test hinzufügen
    addResult(title, content, type = 'info') {
        this.results.push({ title, content, type, timestamp: new Date() });
        console.log(`[${type.toUpperCase()}] ${title}: ${content}`);
    }

    // Health Check
    async testHealthCheck() {
        try {
            this.addResult('Health Check', 'Teste Server-Verfügbarkeit...', 'info');
            
            const response = await this.makeRequest('/health');
            
            if (response.status === 200) {
                this.addResult('Health Check', 'Server ist verfügbar ✅', 'success');
                return true;
            } else {
                this.addResult('Health Check', `Server antwortet mit Status ${response.status} ❌`, 'error');
                return false;
            }
        } catch (error) {
            this.addResult('Health Check', `Server nicht erreichbar: ${error.message} ❌`, 'error');
            return false;
        }
    }

    // Verschlüsselungstest mit Web Crypto API Simulation
    async testWebCryptoEncryption() {
        this.addResult('Web Crypto Test', 'Simuliere client-seitige Verschlüsselung...', 'info');

        const testContent = 'Dies ist ein Testinhalt für die Verschlüsselung.';
        const password = 'test123';
        const urlSecret = crypto.randomBytes(8).toString('hex');

        try {
            // Simuliere die client-seitige Verschlüsselung
            const encrypted = await this.simulateClientEncryption(testContent, password, urlSecret);
            
            // Teste, ob die verschlüsselten Daten wirklich verschlüsselt sind
            const isEncrypted = this.analyzeEncryption(encrypted);
            
            if (isEncrypted.isEncrypted) {
                this.addResult('Web Crypto Test', 
                    `Verschlüsselung erfolgreich ✅\nGröße: ${isEncrypted.size} Bytes\nEntropie: ${isEncrypted.entropy.toFixed(2)} bits/byte\nFormat: ${isEncrypted.format}`, 'success');
                return true;
            } else {
                this.addResult('Web Crypto Test', 'Verschlüsselung fehlgeschlagen - Daten sind nicht verschlüsselt ❌', 'error');
                return false;
            }
        } catch (error) {
            this.addResult('Web Crypto Test', `Verschlüsselungsfehler: ${error.message} ❌`, 'error');
            return false;
        }
    }

    // Simuliere client-seitige Verschlüsselung (V3: random salt, random IV, 600k PBKDF2)
    async simulateClientEncryption(content, password, urlSecret) {
        const FORMAT_VERSION_V3 = 0x03;
        const SALT_LENGTH = 32;
        const IV_LENGTH = 12;
        const ITERATIONS_V3 = 600000;

        const deriveKey = (secret, saltBuffer) => {
            return new Promise((resolve, reject) => {
                crypto.pbkdf2(secret, saltBuffer, ITERATIONS_V3, 32, 'sha256', (err, key) => {
                    if (err) reject(err);
                    else resolve(key);
                });
            });
        };

        const salt = crypto.randomBytes(SALT_LENGTH);
        const iv = crypto.randomBytes(IV_LENGTH);

        let secret;
        if (password && urlSecret) {
            secret = urlSecret + ':' + password;
        } else if (urlSecret) {
            secret = urlSecret;
        } else {
            throw new Error('URL secret required');
        }

        const key = await deriveKey(secret, salt);

        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        let encrypted = cipher.update(content, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        const authTag = cipher.getAuthTag();

        // V3 format: [version:1][salt:32][IV:12][ciphertext+authTag]
        const ciphertext = Buffer.concat([encrypted, authTag]);
        return Buffer.concat([
            Buffer.from([FORMAT_VERSION_V3]),
            salt,
            iv,
            ciphertext
        ]);
    }

    // Analysiere Verschlüsselung
    analyzeEncryption(data) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        
        // Entropie berechnen
        const byteCounts = new Array(256).fill(0);
        for (let i = 0; i < buffer.length; i++) {
            byteCounts[buffer[i]]++;
        }
        
        let entropy = 0;
        const totalBytes = buffer.length;
        
        for (let i = 0; i < 256; i++) {
            if (byteCounts[i] > 0) {
                const probability = byteCounts[i] / totalBytes;
                entropy -= probability * Math.log2(probability);
            }
        }

        // Prüfe auf Verschlüsselungsmerkmale
        const isEncrypted = buffer.length >= 20 && entropy > 7.0;
        
        return {
            isEncrypted,
            size: buffer.length,
            entropy: entropy,
            format: buffer.length >= 12 ? 'IV + Encrypted Data' : 'Unknown',
            hexPreview: buffer.slice(0, 32).toString('hex')
        };
    }

    // API Endpoint Tests
    async testAPIEndpoints() {
        this.addResult('API Tests', 'Teste API-Endpunkte...', 'info');

        const endpoints = [
            { path: '/api/health', method: 'GET', description: 'API Health Check' },
            { path: '/api/share', method: 'POST', description: 'Share Endpoint', data: { content: [1,2,3,4,5], expiration: '30min' } }
        ];

        for (const endpoint of endpoints) {
            try {
                const response = await this.makeRequest(endpoint.path, endpoint.method, endpoint.data);
                
                if (response.status === 200 || response.status === 201) {
                    this.addResult(`API Test: ${endpoint.description}`, `Status ${response.status} ✅`, 'success');
                } else {
                    this.addResult(`API Test: ${endpoint.description}`, `Status ${response.status} ❌`, 'error');
                }
            } catch (error) {
                this.addResult(`API Test: ${endpoint.description}`, `Fehler: ${error.message} ❌`, 'error');
            }
        }
    }

    // Datenbank-Test (falls verfügbar)
    async testDatabaseEncryption() {
        this.addResult('Datenbank Test', 'Teste Datenbank-Verschlüsselung...', 'info');

        try {
            // Versuche einen Test-Clip zu erstellen
            const testContent = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); // Simuliere verschlüsselte Daten
            const shareData = {
                content: Array.from(testContent),
                expiration: '5min',
                oneTime: false,
                hasPassword: false,
                quickShare: false
            };

            const response = await this.makeRequest('/api/share', 'POST', shareData);
            
            if (response.status === 201 && response.data.clipId) {
                this.addResult('Datenbank Test', `Clip erstellt: ${response.data.clipId} ✅`, 'success');
                
                // Versuche den Clip abzurufen
                const retrieveResponse = await this.makeRequest(`/api/clip/${response.data.clipId}`);
                
                if (retrieveResponse.status === 200) {
                    this.addResult('Datenbank Test', 'Clip erfolgreich abgerufen ✅', 'success');
                    
                    // Analysiere die zurückgegebenen Daten
                    if (retrieveResponse.data.content && Array.isArray(retrieveResponse.data.content)) {
                        const analysis = this.analyzeEncryption(retrieveResponse.data.content);
                        this.addResult('Datenbank Analyse', 
                            `Daten sind verschlüsselt: ${analysis.isEncrypted ? 'Ja' : 'Nein'}\nGröße: ${analysis.size} Bytes\nEntropie: ${analysis.entropy.toFixed(2)} bits/byte`, 
                            analysis.isEncrypted ? 'success' : 'warning');
                    }
                } else {
                    this.addResult('Datenbank Test', `Clip-Abruf fehlgeschlagen: Status ${retrieveResponse.status} ❌`, 'error');
                }
            } else {
                this.addResult('Datenbank Test', `Clip-Erstellung fehlgeschlagen: Status ${response.status} ❌`, 'error');
            }
        } catch (error) {
            this.addResult('Datenbank Test', `Datenbankfehler: ${error.message} ❌`, 'error');
        }
    }

    // Sicherheitstests
    async runSecurityTests() {
        this.addResult('Sicherheitstests', 'Führe Sicherheitstests aus...', 'info');

        // Test 1: Rate Limiting
        try {
            const promises = [];
            for (let i = 0; i < 25; i++) {
                promises.push(this.makeRequest('/api/share', 'POST', { content: [1,2,3], expiration: '5min' }));
            }
            
            const responses = await Promise.all(promises);
            const rateLimited = responses.some(r => r.status === 429);
            
            if (rateLimited) {
                this.addResult('Sicherheitstest: Rate Limiting', 'Rate Limiting funktioniert ✅', 'success');
            } else {
                this.addResult('Sicherheitstest: Rate Limiting', 'Rate Limiting nicht aktiv ❌', 'warning');
            }
        } catch (error) {
            this.addResult('Sicherheitstest: Rate Limiting', `Fehler: ${error.message}`, 'error');
        }

        // Test 2: CORS Headers
        try {
            const response = await this.makeRequest('/api/health');
            const corsHeader = response.headers['access-control-allow-origin'];
            
            if (corsHeader) {
                this.addResult('Sicherheitstest: CORS', `CORS Headers vorhanden: ${corsHeader} ✅`, 'success');
            } else {
                this.addResult('Sicherheitstest: CORS', 'CORS Headers fehlen ❌', 'warning');
            }
        } catch (error) {
            this.addResult('Sicherheitstest: CORS', `Fehler: ${error.message}`, 'error');
        }

        // Test 3: Content Security Policy
        try {
            const response = await this.makeRequest('/');
            const cspHeader = response.headers['content-security-policy'];
            
            if (cspHeader) {
                this.addResult('Sicherheitstest: CSP', 'Content Security Policy vorhanden ✅', 'success');
            } else {
                this.addResult('Sicherheitstest: CSP', 'Content Security Policy fehlt ❌', 'warning');
            }
        } catch (error) {
            this.addResult('Sicherheitstest: CSP', `Fehler: ${error.message}`, 'error');
        }
    }

    // Ergebnisse speichern
    saveResults(filename = 'live-encryption-test-results.json') {
        const results = {
            timestamp: new Date().toISOString(),
            baseUrl: this.baseUrl,
            summary: {
                totalTests: this.results.length,
                successfulTests: this.results.filter(r => r.type === 'success').length,
                failedTests: this.results.filter(r => r.type === 'error').length,
                warnings: this.results.filter(r => r.type === 'warning').length
            },
            results: this.results,
            testData: this.testData
        };

        fs.writeFileSync(filename, JSON.stringify(results, null, 2));
        this.addResult('Ergebnisse gespeichert', `Testdaten wurden in ${filename} gespeichert`, 'info');
    }

    // Haupttest ausführen
    async runAllTests() {
        console.log('🔐 Qopy Live-Verschlüsselungstest\n');
        console.log(`Ziel-URL: ${this.baseUrl}\n`);

        try {
            // Health Check
            const isHealthy = await this.testHealthCheck();
            if (!isHealthy) {
                this.addResult('Test abgebrochen', 'Server ist nicht verfügbar', 'error');
                return;
            }

            // Web Crypto Test
            await this.testWebCryptoEncryption();

            // API Tests
            await this.testAPIEndpoints();

            // Datenbank Test
            await this.testDatabaseEncryption();

            // Sicherheitstests
            await this.runSecurityTests();

            // Ergebnisse speichern
            this.saveResults();

            // Zusammenfassung
            const successfulTests = this.results.filter(r => r.type === 'success').length;
            const failedTests = this.results.filter(r => r.type === 'error').length;
            const totalTests = this.results.length;

            console.log('\n📊 TESTZUSAMMENFASSUNG');
            console.log('='.repeat(60));
            console.log(`✅ Erfolgreiche Tests: ${successfulTests}`);
            console.log(`❌ Fehlgeschlagene Tests: ${failedTests}`);
            console.log(`📊 Gesamte Tests: ${totalTests}`);
            console.log(`📈 Erfolgsrate: ${((successfulTests / totalTests) * 100).toFixed(1)}%`);

            if (failedTests === 0) {
                console.log('\n🎉 ALLE TESTS ERFOLGREICH! Die Verschlüsselung funktioniert korrekt.');
            } else {
                console.log('\n⚠️  EINIGE TESTS FEHLGESCHLAGEN! Bitte überprüfen Sie die Implementierung.');
            }

        } catch (error) {
            console.error('❌ Testfehler:', error.message);
            process.exit(1);
        }
    }
}

// Hauptfunktion
async function main() {
    const baseUrl = process.argv[2] || 'http://localhost:8080';
    const tester = new LiveEncryptionTester(baseUrl);
    await tester.runAllTests();
}

// Skript ausführen
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { LiveEncryptionTester }; 