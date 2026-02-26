const crypto = require('crypto');

/**
 * TokenService - Handles download token generation and validation
 */
class TokenService {
    constructor() {
        this.salt = process.env.PBKDF2_SALT || 'qopy-access-salt-v1';
        this.iterations = 100000;
        this.keyLength = 64;
        this.algorithm = 'sha512';
    }

    /**
     * Generate hash for access code
     * @param {string} accessCode - The access code to hash
     * @returns {Promise<string>} - The hashed access code
     */
    async generateHash(accessCode) {
        return new Promise((resolve, reject) => {
            crypto.pbkdf2(accessCode, this.salt, this.iterations, this.keyLength, this.algorithm, (err, derivedKey) => {
                if (err) reject(err);
                else resolve(derivedKey.toString('hex'));
            });
        });
    }

    /**
     * Check if provided code is already hashed
     * @param {string} accessCode - The access code to check
     * @returns {boolean} - True if already hashed
     */
    isAlreadyHashed(accessCode) {
        return accessCode.length === 128 && /^[a-f0-9]+$/i.test(accessCode);
    }

    /**
     * Validate access code against stored hash
     * @param {string} providedCode - The provided access code
     * @param {string} storedHash - The stored hash to compare against
     * @returns {Promise<boolean>} - True if valid
     */
    async validateAccessCode(providedCode, storedHash) {
        try {
            let providedHash;
            
            if (this.isAlreadyHashed(providedCode)) {
                if (process.env.NODE_ENV !== 'production') {
                    console.log('🔐 Using client-side hashed access code for file validation');
                }
                providedHash = providedCode;
            } else {
                if (process.env.NODE_ENV !== 'production') {
                    console.log('🔐 Generating server-side access code hash for file validation');
                }
                providedHash = await this.generateHash(providedCode);
            }

            const a = Buffer.from(providedHash);
            const b = Buffer.from(storedHash);
            return a.length === b.length && crypto.timingSafeEqual(a, b);
        } catch (error) {
            console.error('❌ Error validating access code:', error);
            return false;
        }
    }
}

module.exports = TokenService;