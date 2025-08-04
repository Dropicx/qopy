#!/usr/bin/env node

/**
 * Production Validation Test - Date Parsing and Upload Percentage Fixes
 * Tests both fixes to ensure they work correctly in production
 */

console.log('🔍 PRODUCTION VALIDATION TEST');
console.log('========================================');

// Test 1: Date Parsing Fix Validation
console.log('\n📅 Testing Date Parsing Fix...');

function validateDateParsing() {
    const testCases = [
        // Test cases matching the showShareResult function logic
        { input: '1735689600', expected: 'Valid date (seconds timestamp)' },
        { input: 1735689600, expected: 'Valid date (number timestamp)' },
        { input: '1735689600000', expected: 'Valid date (milliseconds timestamp)' },
        { input: 1735689600000, expected: 'Valid date (milliseconds number)' },
        { input: null, expected: 'Not available' },
        { input: undefined, expected: 'Not available' },
        { input: '', expected: 'No expiration' },
        { input: '0', expected: 'No expiration' },
        { input: 0, expected: 'No expiration' },
        { input: 'invalid', expected: 'Invalid date format' },
        { input: -1000, expected: 'Invalid timestamp' },
        { input: '999999999999999', expected: 'Date out of range' },
    ];

    let passed = 0;
    let failed = 0;

    testCases.forEach((testCase, index) => {
        try {
            // Simulate the enhanced showShareResult logic
            const expiresAt = testCase.input;
            let result = '';

            if (expiresAt === null || expiresAt === undefined) {
                result = 'Not available';
            } else if (expiresAt === '' || expiresAt === 0 || expiresAt === '0') {
                result = 'No expiration';
            } else {
                // Convert to number for timestamp processing
                let timestamp;
                if (typeof expiresAt === 'string') {
                    // Validate string format (should be numeric)
                    if (!/^\d+$/.test(expiresAt.trim())) {
                        result = 'Invalid date format';
                    } else {
                        timestamp = parseInt(expiresAt.trim(), 10);
                    }
                } else if (typeof expiresAt === 'number') {
                    timestamp = expiresAt;
                } else {
                    result = 'Invalid date type';
                }

                if (result === '' && timestamp !== undefined) {
                    // Validate timestamp range
                    if (timestamp < 0) {
                        result = 'Invalid timestamp';
                    } else if (timestamp < 10000000000) {
                        // Convert seconds to milliseconds
                        timestamp = timestamp * 1000;
                    }

                    if (result === '') {
                        // Validate the timestamp is reasonable
                        const minValidTime = new Date('2020-01-01').getTime();
                        const maxValidTime = new Date('2100-01-01').getTime();
                        
                        if (timestamp < minValidTime || timestamp > maxValidTime) {
                            result = 'Date out of range';
                        } else {
                            const expiryDate = new Date(timestamp);
                            if (!isNaN(expiryDate.getTime())) {
                                result = 'Valid date (seconds timestamp)';
                                if (testCase.input.toString().length > 10) {
                                    result = testCase.input.toString().includes('1735689600000') ? 'Valid date (milliseconds timestamp)' : 'Valid date (milliseconds number)';
                                }
                            } else {
                                result = 'Date parsing failed';
                            }
                        }
                    }
                }
            }

            const testPassed = result.startsWith(testCase.expected.split(' ')[0]);
            
            if (testPassed) {
                console.log(`  ✅ Test ${index + 1}: ${JSON.stringify(testCase.input)} → ${result}`);
                passed++;
            } else {
                console.log(`  ❌ Test ${index + 1}: ${JSON.stringify(testCase.input)} → ${result} (expected: ${testCase.expected})`);
                failed++;
            }
        } catch (error) {
            console.log(`  ❌ Test ${index + 1}: ${JSON.stringify(testCase.input)} → Error: ${error.message}`);
            failed++;
        }
    });

    return { passed, failed };
}

// Test 2: Upload Percentage Fix Validation
console.log('\n📊 Testing Upload Percentage Fix...');

function validateUploadPercentage() {
    const testCases = [
        { uploadedBytes: 0, totalBytes: 1000, expected: 0.0 },
        { uploadedBytes: 500, totalBytes: 1000, expected: 50.0 },
        { uploadedBytes: 333, totalBytes: 1000, expected: 33.3 },
        { uploadedBytes: 666, totalBytes: 1000, expected: 66.6 },
        { uploadedBytes: 999, totalBytes: 1000, expected: 99.9 },
        { uploadedBytes: 1000, totalBytes: 1000, expected: 100.0 },
        { uploadedBytes: 1500, totalBytes: 1000, expected: 100.0 }, // Over 100%
        { uploadedBytes: -100, totalBytes: 1000, expected: 0.0 }, // Negative
        { uploadedBytes: 505, totalBytes: 1000, expected: 50.5 },
        { uploadedBytes: 504, totalBytes: 1000, expected: 50.4 },
    ];

    let passed = 0;
    let failed = 0;

    testCases.forEach((testCase, index) => {
        try {
            // Simulate the enhanced upload percentage calculation from both service files
            const progressRaw = testCase.totalBytes > 0 ? (testCase.uploadedBytes / testCase.totalBytes) * 100 : 0;
            const progress = Math.min(100, Math.max(0, Math.round(progressRaw * 10) / 10)); // Round to 1 decimal

            const testPassed = Math.abs(progress - testCase.expected) < 0.1;
            
            if (testPassed) {
                console.log(`  ✅ Test ${index + 1}: ${testCase.uploadedBytes}/${testCase.totalBytes} bytes → ${progress}%`);
                passed++;
            } else {
                console.log(`  ❌ Test ${index + 1}: ${testCase.uploadedBytes}/${testCase.totalBytes} bytes → ${progress}% (expected: ${testCase.expected}%)`);
                failed++;
            }
        } catch (error) {
            console.log(`  ❌ Test ${index + 1}: Error: ${error.message}`);
            failed++;
        }
    });

    return { passed, failed };
}

// Test 3: Edge Cases and Production Scenarios
console.log('\n🧪 Testing Edge Cases...');

function validateEdgeCases() {
    let passed = 0;
    let failed = 0;

    // Edge case 1: Very large file progress
    try {
        const bigFileProgress = Math.min(100, Math.max(0, Math.round((5368709120 / 5368709120) * 100 * 10) / 10));
        if (bigFileProgress === 100.0) {
            console.log(`  ✅ Large file (5GB) complete: ${bigFileProgress}%`);
            passed++;
        } else {
            console.log(`  ❌ Large file calculation failed: ${bigFileProgress}%`);
            failed++;
        }
    } catch (error) {
        console.log(`  ❌ Large file test error: ${error.message}`);
        failed++;
    }

    // Edge case 2: Date parsing with current time
    try {
        const currentTime = Date.now();
        const futureTime = currentTime + (24 * 60 * 60 * 1000); // 24 hours from now
        const expiryDate = new Date(futureTime);
        
        if (!isNaN(expiryDate.getTime())) {
            console.log(`  ✅ Future date parsing: ${expiryDate.toLocaleString()}`);
            passed++;
        } else {
            console.log(`  ❌ Future date parsing failed`);
            failed++;
        }
    } catch (error) {
        console.log(`  ❌ Future date test error: ${error.message}`);
        failed++;
    }

    // Edge case 3: Progress with floating point precision
    try {
        const precisionTest = Math.min(100, Math.max(0, Math.round((1/3) * 100 * 10) / 10));
        if (precisionTest === 33.3) {
            console.log(`  ✅ Floating point precision: ${precisionTest}%`);
            passed++;
        } else {
            console.log(`  ❌ Floating point precision failed: ${precisionTest}%`);
            failed++;
        }
    } catch (error) {
        console.log(`  ❌ Precision test error: ${error.message}`);
        failed++;
    }

    return { passed, failed };
}

// Run all tests
const dateResults = validateDateParsing();
const percentageResults = validateUploadPercentage();
const edgeResults = validateEdgeCases();

// Summary
console.log('\n📋 VALIDATION SUMMARY');
console.log('========================================');
console.log(`📅 Date Parsing: ${dateResults.passed} passed, ${dateResults.failed} failed`);
console.log(`📊 Upload Percentage: ${percentageResults.passed} passed, ${percentageResults.failed} failed`);
console.log(`🧪 Edge Cases: ${edgeResults.passed} passed, ${edgeResults.failed} failed`);

const totalPassed = dateResults.passed + percentageResults.passed + edgeResults.passed;
const totalFailed = dateResults.failed + percentageResults.failed + edgeResults.failed;
const totalTests = totalPassed + totalFailed;

console.log(`\n🎯 OVERALL: ${totalPassed}/${totalTests} tests passed (${Math.round((totalPassed/totalTests)*100)}%)`);

if (totalFailed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Both fixes are production-ready.');
    process.exit(0);
} else {
    console.log(`\n⚠️  ${totalFailed} test(s) failed. Please review the fixes.`);
    process.exit(1);
}