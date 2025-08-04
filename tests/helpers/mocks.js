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
 *    For proprietary/commercial use. Contact qopy@lit.services
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

// Mock database pool
const mockPool = {
  query: jest.fn(),
  end: jest.fn()
};

// Mock Redis client
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  expire: jest.fn(),
  quit: jest.fn()
};

// Mock Express request
const mockRequest = (overrides = {}) => ({
  params: {},
  body: {},
  query: {},
  headers: {},
  file: null,
  files: null,
  ip: '127.0.0.1',
  ...overrides
});

// Mock Express response
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
};

// Mock file system operations
const mockFs = {
  ensureDir: jest.fn(),
  ensureDirSync: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
  stat: jest.fn(),
  pathExists: jest.fn(),
  remove: jest.fn(),
  copy: jest.fn(),
  move: jest.fn(),
  emptyDir: jest.fn()
};

// Mock Sharp image processing
const mockSharp = jest.fn(() => ({
  metadata: jest.fn().mockResolvedValue({ width: 100, height: 100 }),
  resize: jest.fn().mockReturnThis(),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-image-data'))
}));

// Mock crypto operations
const mockCrypto = {
  randomBytes: jest.fn((size) => Buffer.alloc(size, 0)),
  pbkdf2Sync: jest.fn(() => Buffer.from('mock-hash')),
  timingSafeEqual: jest.fn(() => true),
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => 'mock-hash')
  }))
};

// Mock multer upload
const mockUpload = {
  single: jest.fn(() => (req, res, next) => next()),
  array: jest.fn(() => (req, res, next) => next()),
  fields: jest.fn(() => (req, res, next) => next())
};

module.exports = {
  mockPool,
  mockRedis,
  mockRequest,
  mockResponse,
  mockFs,
  mockSharp,
  mockCrypto,
  mockUpload
};