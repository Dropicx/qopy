const fs = require('fs-extra');

/**
 * Safely delete a file with permission handling.
 * Returns a result object instead of throwing, so callers can handle failures gracefully.
 * @param {string} filePath - Path to the file to delete
 * @returns {Promise<Object>} - Result object with success and reason
 */
async function safeDeleteFile(filePath) {
    try {
        const fileExists = await fs.pathExists(filePath);
        if (!fileExists) {
            return { success: true, reason: 'file_not_exists' };
        }

        await fs.stat(filePath);
        await fs.unlink(filePath);
        return { success: true, reason: 'deleted' };
    } catch (error) {
        if (error.code === 'ENOENT') {
            return { success: true, reason: 'file_not_exists' };
        } else if (error.code === 'EACCES' || error.code === 'EPERM') {
            return { success: false, reason: 'permission_denied', error: error.message };
        } else if (error.code === 'EBUSY' || error.code === 'ENOTEMPTY') {
            return { success: false, reason: 'file_in_use', error: error.message };
        } else {
            return { success: false, reason: 'unknown_error', error: error.message };
        }
    }
}

module.exports = { safeDeleteFile };
