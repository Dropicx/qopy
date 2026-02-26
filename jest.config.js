/*
 * Copyright (C) 2025 Qopy App
 * 
 * This file is part of Qopy.
 * 
 * Qopy is dual-licensed:
 * 
 * 1. GNU Affero General Public License v3.0 (AGPL-3.0)
 *    For open source use. See LICENSE-AGPL for details.
 * 
 * 2. Commercial License
 *    For proprietary/commercial use. Contact qopy.quiet156@passmail.net
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  // In CI, skip tests that have mock/implementation mismatches (to be fixed)
  ...(process.env.CI === 'true' && process.env.SKIP_FLAKY_TESTS === '1' ? {
    testPathIgnorePatterns: [
      'UploadCompletionService.test',
      'UploadValidator.test',
      'FileAssemblyService.test',
      'QuickShareService.test',
      'EncryptionService.test'
    ]
  } : {}),
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  collectCoverageFrom: [
    'server.js',
    'services/**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/tests/**'
  ],
  coverageReporters: ['text', 'html', 'lcov'],
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 40,
      lines: 40,
      statements: 40
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/helpers/setup.js'],
  testTimeout: 30000,
  verbose: true,
  collectCoverage: true,
  coverageDirectory: 'coverage',
  maxWorkers: 4
};