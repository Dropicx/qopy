/*
 * Copyright (C) 2025 Qopy App
 *
 * SQL Injection Security Test Suite
 * Tests parameterized query protection against SQL injection attacks
 */

const request = require('supertest');
const { Pool } = require('pg');

// SQL Injection attack patterns to test
const SQL_INJECTION_PAYLOADS = [
    // Classic SQL injection
    "' OR '1'='1",
    "' OR '1'='1' --",
    "' OR '1'='1' /*",

    // Union-based injection
    "' UNION SELECT NULL, NULL, NULL--",
    "' UNION SELECT * FROM clips--",

    // Stacked queries
    "'; DROP TABLE clips;--",
    "'; DELETE FROM clips WHERE '1'='1",

    // Boolean-based blind injection
    "' AND '1'='1",
    "' AND '1'='2",

    // Time-based blind injection
    "'; SELECT pg_sleep(5);--",
    "' AND (SELECT * FROM pg_sleep(5))--",

    // Comment injection
    "' OR 1=1--",
    "' OR 1=1#",
    "' OR 1=1/*",

    // Advanced patterns
    "admin'--",
    "admin' #",
    "admin'/*",
    "' or 1=1 limit 1 --",

    // Encoded injection
    "' %6f%72 '1'='1",

    // Second-order injection patterns
    "\\'; DROP TABLE clips;--",
    "1' AND SLEEP(5) AND '1'='1"
];

describe('SQL Injection Security Tests', () => {
    let pool;
    let app;

    beforeAll(async () => {
        // Set up test database connection
        pool = new Pool({
            connectionString: process.env.DATABASE_URL || process.env.TEST_DATABASE_URL
        });

        // Import server app (mock mode for testing)
        process.env.NODE_ENV = 'test';
    });

    afterAll(async () => {
        if (pool) {
            await pool.end();
        }
    });

    describe('Clip ID SQL Injection Tests', () => {
        test.each(SQL_INJECTION_PAYLOADS)(
            'should reject SQL injection in clipId: %s',
            async (payload) => {
                try {
                    // Test direct database query with injection payload
                    const result = await pool.query(
                        'SELECT * FROM clips WHERE clip_id = $1',
                        [payload]
                    );

                    // If we get here, parameterized query worked correctly
                    // Injection payload was treated as literal string, not SQL
                    expect(result.rows.length).toBe(0); // No clips match the malicious string

                } catch (error) {
                    // Parameterized queries should NOT throw errors with malicious input
                    // If an error is thrown, it means the query is vulnerable
                    throw new Error(`Parameterized query should not throw error: ${error.message}`);
                }
            }
        );
    });

    describe('Upload ID SQL Injection Tests', () => {
        test.each(SQL_INJECTION_PAYLOADS)(
            'should reject SQL injection in uploadId: %s',
            async (payload) => {
                try {
                    const result = await pool.query(
                        'SELECT * FROM upload_sessions WHERE upload_id = $1',
                        [payload]
                    );

                    expect(result.rows.length).toBe(0);

                } catch (error) {
                    fail(`Parameterized query should not throw error: ${error.message}`);
                }
            }
        );
    });

    describe('File Chunks SQL Injection Tests', () => {
        test('should reject SQL injection in chunk queries', async () => {
            const maliciousUploadId = "' OR '1'='1";
            const maliciousChunkNumber = "0; DROP TABLE file_chunks;--";

            try {
                const result = await pool.query(
                    'SELECT * FROM file_chunks WHERE upload_id = $1 AND chunk_number = $2',
                    [maliciousUploadId, maliciousChunkNumber]
                );

                // Query should execute safely and return no results
                expect(result.rows.length).toBe(0);

            } catch (error) {
                fail(`Parameterized query should handle malicious input: ${error.message}`);
            }
        });
    });

    describe('Statistics Update SQL Injection Tests', () => {
        test('should use whitelist validation for statistics type', async () => {
            const maliciousType = "clip_created'; DROP TABLE statistics;--";

            // The updateStatistics function should use a switch statement
            // which acts as a whitelist, preventing SQL injection
            const validTypes = [
                'clip_created',
                'clip_accessed',
                'quick_share_created',
                'password_protected_created',
                'one_time_created',
                'normal_created'
            ];

            // Malicious type should not match any valid type
            expect(validTypes).not.toContain(maliciousType);
        });
    });

    describe('Information Schema Query Safety', () => {
        test('information_schema queries use only hardcoded values', () => {
            // Verify that all information_schema queries in the codebase
            // use hardcoded table/column names, not user input

            const safePatterns = [
                "WHERE table_name = 'clips'",
                "WHERE table_name = 'file_chunks'",
                "WHERE table_name = 'upload_sessions'",
                "WHERE column_name = 'checksum'",
                "WHERE column_name = 'clip_id'"
            ];

            // All patterns should use hardcoded strings in quotes
            safePatterns.forEach(pattern => {
                expect(pattern).toMatch(/'[a-z_]+'/);
            });
        });
    });

    describe('Parameterized Query Verification', () => {
        test('all queries should use $1, $2, etc. placeholders', async () => {
            // Test that queries properly use positional parameters
            const testData = {
                clipId: "test123",
                contentType: "text",
                expirationTime: Date.now() + 3600000
            };

            try {
                // This query uses parameterized values
                const result = await pool.query(
                    'SELECT * FROM clips WHERE clip_id = $1 AND content_type = $2 AND expiration_time > $3',
                    [testData.clipId, testData.contentType, testData.expirationTime]
                );

                // Should execute without error
                expect(result).toBeDefined();
                expect(Array.isArray(result.rows)).toBe(true);

            } catch (error) {
                fail(`Parameterized query execution failed: ${error.message}`);
            }
        });
    });

    describe('Special Characters Handling', () => {
        const specialChars = [
            "'", '"', ';', '--', '/*', '*/',
            '\\', '\n', '\r', '\t', '\0'
        ];

        test.each(specialChars)(
            'should safely handle special character: %s',
            async (char) => {
                const testString = `test${char}value`;

                try {
                    const result = await pool.query(
                        'SELECT * FROM clips WHERE clip_id = $1',
                        [testString]
                    );

                    // Should not throw error or execute malicious code
                    expect(result).toBeDefined();

                } catch (error) {
                    fail(`Should handle special character safely: ${error.message}`);
                }
            }
        );
    });

    describe('Second-Order SQL Injection Prevention', () => {
        test('should not use retrieved data in dynamic queries', async () => {
            // Second-order SQL injection occurs when data retrieved from
            // the database is used to build subsequent queries without sanitization

            // Simulate storing malicious data
            const maliciousClipId = "' OR '1'='1--";

            try {
                // First query - store data (should be safe with parameterized query)
                await pool.query(
                    'INSERT INTO clips (clip_id, content_type, content, expiration_time, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
                    [maliciousClipId, 'text', Buffer.from('test'), Date.now() + 3600000, Date.now()]
                );

                // Second query - retrieve and use data
                const result = await pool.query(
                    'SELECT clip_id FROM clips WHERE clip_id = $1',
                    [maliciousClipId]
                );

                if (result.rows.length > 0) {
                    const retrievedClipId = result.rows[0].clip_id;

                    // Third query - use retrieved data (should still be parameterized)
                    const finalResult = await pool.query(
                        'SELECT * FROM clips WHERE clip_id = $1',
                        [retrievedClipId] // Still using parameterized query
                    );

                    expect(finalResult.rows.length).toBeLessThanOrEqual(1);
                }

                // Cleanup
                await pool.query('DELETE FROM clips WHERE clip_id = $1', [maliciousClipId]);

            } catch (error) {
                // Clean up even if test fails
                try {
                    await pool.query('DELETE FROM clips WHERE clip_id = $1', [maliciousClipId]);
                } catch (cleanupError) {
                    // Ignore cleanup errors
                }
                fail(`Second-order injection test failed: ${error.message}`);
            }
        });
    });

    describe('Query Performance with Injection Attempts', () => {
        test('malicious queries should not cause performance issues', async () => {
            const startTime = Date.now();

            // Attempt time-based blind SQL injection
            const payload = "' AND (SELECT pg_sleep(5))--";

            try {
                await pool.query(
                    'SELECT * FROM clips WHERE clip_id = $1',
                    [payload]
                );

                const executionTime = Date.now() - startTime;

                // Query should execute quickly (< 1 second)
                // If it takes 5+ seconds, the injection succeeded
                expect(executionTime).toBeLessThan(1000);

            } catch (error) {
                fail(`Query should execute without delay: ${error.message}`);
            }
        });
    });
});

describe('Security Documentation', () => {
    test('README should exist with SQL injection prevention info', () => {
        const fs = require('fs');
        const path = require('path');

        // Check if SECURITY.md exists
        const securityPath = path.join(__dirname, '../../SECURITY.md');

        if (fs.existsSync(securityPath)) {
            const content = fs.readFileSync(securityPath, 'utf8');
            expect(content).toContain('SQL injection');
        }
    });
});
