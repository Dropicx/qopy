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

/**
 * Shared anonymous ID validation utility
 * Format: XXXX-XXXX-XXXX-XXXX using base32-like charset (excluding confusing chars 0, O, I, L)
 */

const ANONYMOUS_ID_PATTERN = /^[123456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[123456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[123456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[123456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

/**
 * Validate the basic format of an anonymous ID
 * @param {*} anonymousId - The anonymous ID to validate
 * @returns {{ valid: boolean, error?: string }} Validation result
 */
function validateAnonymousIdFormat(anonymousId) {
    if (!anonymousId || typeof anonymousId !== 'string') {
        return { valid: false, error: 'Anonymous ID is required' };
    }
    if (!ANONYMOUS_ID_PATTERN.test(anonymousId)) {
        return { valid: false, error: 'Invalid anonymous ID format' };
    }
    return { valid: true };
}

module.exports = { ANONYMOUS_ID_PATTERN, validateAnonymousIdFormat };
