/*
 * Unit tests for pathSafety.resolvePathUnderBase
 */

const path = require('path');
const { resolvePathUnderBase } = require('../../../services/utils/pathSafety');

describe('pathSafety.resolvePathUnderBase', () => {
  const basePath = path.resolve('/tmp/storage');

  test('returns resolved path when file is under base', () => {
    const filePath = path.join(basePath, 'files', 'abc.enc');
    expect(resolvePathUnderBase(filePath, basePath)).toBe(path.resolve(filePath));
  });

  test('accepts absolute path under base', () => {
    const filePath = path.join(basePath, 'files', 'abc.enc');
    const resolved = resolvePathUnderBase(filePath, basePath);
    expect(resolved).toBe(path.resolve(filePath));
    expect(resolved.startsWith(basePath)).toBe(true);
  });

  test('throws when file path resolves outside base', () => {
    expect(() => resolvePathUnderBase('/etc/passwd', basePath)).toThrow('Path outside storage');
    expect(() => resolvePathUnderBase(path.join(basePath, '..', 'etc', 'passwd'), basePath)).toThrow('Path outside storage');
  });

  test('throws when file path is empty', () => {
    expect(() => resolvePathUnderBase('', basePath)).toThrow('Path outside storage');
    expect(() => resolvePathUnderBase('   ', basePath)).toThrow('Path outside storage');
  });

  test('throws when base path is empty', () => {
    expect(() => resolvePathUnderBase('/tmp/storage/file', '')).toThrow('Path outside storage');
  });

  test('accepts file path equal to base (edge case)', () => {
    const resolved = resolvePathUnderBase(basePath, basePath);
    expect(resolved).toBe(path.resolve(basePath));
  });

  test('throws for non-string file path', () => {
    expect(() => resolvePathUnderBase(null, basePath)).toThrow('Path outside storage');
    expect(() => resolvePathUnderBase(undefined, basePath)).toThrow('Path outside storage');
  });
});
