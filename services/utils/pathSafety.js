/*
 * Path safety utilities for file operations.
 * Ensures paths from the database stay under the configured storage root.
 */

const path = require('path');

/**
 * Resolve a file path and assert it remains under the given base path.
 * Guards against path traversal from legacy or corrupted file_path values in the DB.
 * @param {string} filePath - Path to the file (absolute or relative)
 * @param {string} basePath - Base directory that filePath must be under
 * @returns {string} The resolved absolute file path
 * @throws {Error} If filePath is empty, or resolved path is outside basePath
 */
function resolvePathUnderBase(filePath, basePath) {
    if (typeof filePath !== 'string' || !filePath.trim()) {
        throw new Error('Path outside storage');
    }
    if (typeof basePath !== 'string' || !basePath.trim()) {
        throw new Error('Path outside storage');
    }
    const resolvedFile = path.resolve(filePath);
    const resolvedBase = path.resolve(basePath);
    const baseWithSep = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep;
    const isUnderBase = resolvedFile === resolvedBase || resolvedFile.startsWith(baseWithSep);
    if (!isUnderBase) {
        throw new Error('Path outside storage');
    }
    return resolvedFile;
}

module.exports = { resolvePathUnderBase };
