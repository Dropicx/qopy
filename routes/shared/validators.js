/*
 * Copyright (C) 2025 Qopy App
 * Shared route validators — centralizes validation logic used across multiple route modules.
 */

const { param } = require('express-validator');

/**
 * Clip ID validation middleware for express-validator.
 * Supports two ID formats:
 *   - 6-char: Quick Share clips (short-lived, 5-minute expiration)
 *   - 10-char: Enhanced mode clips (configurable expiration, optional password)
 * Both formats use uppercase alphanumeric characters only (A-Z, 0-9).
 */
const clipIdValidator = param('clipId').custom((value) => {
  if (value.length !== 6 && value.length !== 10) {
    throw new Error('Clip ID must be 6 or 10 characters');
  }
  if (!/^[A-Z0-9]+$/.test(value)) {
    throw new Error('Clip ID must contain only uppercase letters and numbers');
  }
  return true;
});

module.exports = { clipIdValidator };
