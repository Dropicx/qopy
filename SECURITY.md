# Security Policy

## Overview

Qopy is a privacy-first, enterprise-grade secure temporary text and file sharing application with client-side encryption and zero-knowledge architecture. Security is our highest priority.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

**Email**: qopy@lit.services
**Subject**: `[SECURITY] Vulnerability Report`

**Please include**:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if available)

**Do NOT**:
- Publicly disclose the vulnerability before it's fixed
- Attempt to exploit the vulnerability beyond verification
- Access, modify, or delete data belonging to others

**Response Timeline**:
- Acknowledgment: Within 24 hours
- Initial assessment: Within 48 hours
- Fix deployed: Within 7 days for critical issues

## Security Measures

### 1. SQL Injection Prevention (CVE 9.8 - CRITICAL) ✅

**Status**: PROTECTED

**Protection Layers**:
- **Parameterized Queries**: All 50+ database queries use PostgreSQL parameterized queries with `$1, $2, etc.` placeholders
- **Zero String Concatenation**: No SQL queries built using string concatenation or template literals
- **Express-Validator**: Input validation on all user-facing endpoints
- **Whitelist Validation**: Enumerated types (statistics, expiration) use switch statements
- **Input Sanitizer**: Defense-in-depth utility monitors suspicious patterns (`utils/inputSanitizer.js`)
- **Automated Testing**: Comprehensive test suite with 30+ injection payloads (`tests/security/sql-injection.test.js`)

**Example Secure Code**:
```javascript
// ✅ SECURE - Parameterized query prevents SQL injection
const result = await pool.query(
  'SELECT * FROM clips WHERE clip_id = $1 AND is_expired = false',
  [clipId]
);

// ❌ NEVER DO THIS - Vulnerable to SQL injection
const result = await pool.query(
  `SELECT * FROM clips WHERE clip_id = '${clipId}'`
);
```

**Testing**:
```bash
npm test tests/security/sql-injection.test.js
```

### 2. Password Security (CVE 9.1 - CRITICAL) ✅

**Status**: PROTECTED

**Protection Layers**:
- **bcrypt Hashing**: Admin passwords hashed with bcrypt (cost factor 12, ~250ms)
- **No Plaintext Storage**: Passwords never stored in plaintext
- **Constant-Time Comparison**: bcrypt.compare() prevents timing attacks
- **Token Hashing at Startup**: Admin tokens hashed once during server initialization

**Implementation**:
```javascript
// Server startup - hash admin token
adminTokenHash = await bcrypt.hash(process.env.ADMIN_TOKEN, 12);

// Authentication - secure comparison
const isValid = await bcrypt.compare(password, adminTokenHash);
```

**Location**: `server.js:47` (global variable), `server.js:2593-2635` (middleware), `server.js:2638-2680` (login endpoint)

### 3. Client-Side Encryption

**Zero-Knowledge Architecture**:
- **AES-256-GCM**: Industry-standard encryption with authentication
- **PBKDF2 Key Derivation**: 100,000 iterations for password-protected content
- **URL Secrets**: 16-character random secrets in URL fragment (never sent to server)
- **Server Never Sees Plaintext**: All encryption/decryption happens client-side

**Encryption Flow**:
1. Client generates URL secret (16 chars) or uses password
2. PBKDF2 derives encryption key (100k iterations)
3. AES-256-GCM encrypts content with generated IV
4. Encrypted content sent to server
5. URL: `/clip/{clipId}#{urlSecret}` - fragment never transmitted

### 4. CORS Protection

**Configuration**:
- **Origin Validation**: Whitelist of allowed origins
- **Browser Extension Blocking**: Silent rejection of extension requests (prevents crashes)
- **Credential Support**: Cookies allowed for authenticated requests
- **Secure Headers**: helmet.js enforces security headers

**Implementation**: `server.js:416-454`

### 5. Rate Limiting

**Protection Levels**:
- **Admin API**: 10 requests/15min per IP
- **Retrieval**: 50 requests/15min per IP (read-heavy workload)
- **General API**: 100 requests/15min per IP

**Implementation**: Express-rate-limit with memory store

### 6. Input Validation

**Express-Validator**:
- **Filename**: 1-255 characters, string type
- **Filesize**: 1 byte - 100MB, integer validation
- **MIME Type**: Max 100 characters, string type
- **Expiration**: Whitelist (`5min`, `15min`, `30min`, `1hr`, `6hr`, `24hr`)
- **Boolean Flags**: Type validation for hasPassword, oneTime, quickShare

**Additional Sanitization**:
- **Clip IDs**: 4 chars (quick share) or 10 chars (enhanced)
- **Upload IDs**: UUID v4 format validation
- **Filenames**: Path traversal prevention, directory separator removal

**Utility**: `utils/inputSanitizer.js`

### 7. Path Traversal Prevention

**File Storage Protection**:
- **Absolute Paths**: All file operations use `path.join()` with validated base directory
- **Filename Sanitization**: Remove `..`, `/`, `\`, null bytes
- **Upload ID Validation**: UUID format prevents directory traversal
- **Storage Isolation**: Files stored in dedicated `/uploads` directory with subdirectories

**Base Path**: `process.env.RAILWAY_VOLUME_MOUNT_PATH || './uploads'`

### 8. Database Security

**Connection Pooling**:
- **Production**: Max 20 connections, min 5 (optimized for Railway)
- **Development**: Max 10 connections, min 2
- **Idle Timeout**: 30 seconds
- **Max Uses**: 7,500 queries per connection (prevents memory leaks)

**Query Safety**:
- **Parameterized Queries**: 100% of queries use positional parameters
- **Transaction Support**: Multi-step operations use transactions
- **Error Handling**: Connection errors handled gracefully
- **Prepared Statements**: Automatic optimization by pg driver

**Schema Validation**: Automatic column alignment checks on startup

### 9. Redis Security (Optional)

**Protection Measures**:
- **Optional Connection**: App continues without Redis if unavailable
- **Connection Timeout**: 10-second timeout prevents hanging
- **No Crash on Failure**: Errors logged as warnings, not critical
- **Memory Leak Prevention**: Event listener cleanup, heartbeat monitoring
- **Graceful Degradation**: In-memory fallback for upload sessions

**Implementation**: `config/redis.js`

### 10. Session Management

**Upload Sessions**:
- **Expiration**: Automatic cleanup of expired sessions (5-minute interval)
- **Redis Caching**: Optional caching with TTL
- **Foreign Key Cascade**: Automatic cleanup of related chunks
- **UUID Generation**: Cryptographically secure upload IDs

### 11. Admin Dashboard Security

**Authentication**:
- **Token-Based**: Bearer token authentication
- **bcrypt Hashing**: Secure password comparison
- **No Session Storage**: Stateless authentication
- **Rate Limiting**: 10 requests/15min for admin endpoints

**Protected Endpoints**:
- `/api/admin/auth` - Login
- `/api/admin/stats` - Statistics
- `/api/admin/clips` - Recent clips
- `/api/admin/system` - System information

## Security Best Practices

### For Developers

**Code Review Checklist**:
- ✅ All database queries use parameterized queries
- ✅ No user input concatenated into SQL strings
- ✅ All user inputs validated with express-validator
- ✅ Passwords hashed with bcrypt before storage
- ✅ File paths use path.join() with validated base directory
- ✅ No sensitive data logged (passwords, tokens, content)
- ✅ Error messages don't expose internal system details
- ✅ Rate limiting applied to all public endpoints
- ✅ CORS configured correctly for production domains
- ✅ Security tests pass for all changes

**Testing Security Changes**:
```bash
# Run full security test suite
npm test tests/security/

# Run SQL injection tests
npm test tests/security/sql-injection.test.js

# Run integration tests
npm run test:integration

# Check test coverage
npm run test:coverage
```

### For Deployment

**Environment Variables** (Required):
```bash
DATABASE_URL=postgresql://user:pass@host/db    # PostgreSQL connection
ADMIN_TOKEN=<secure-random-token>               # Admin authentication
NODE_ENV=production                              # Environment mode
RAILWAY_VOLUME_MOUNT_PATH=/path/to/volume      # File storage path
```

**Optional**:
```bash
REDIS_URL=redis://user:pass@host:port           # Redis caching
REDISCLOUD_URL=redis://user:pass@host:port      # Alternative Redis
```

**Security Checklist**:
- ✅ Use strong, random ADMIN_TOKEN (32+ characters)
- ✅ Set NODE_ENV=production
- ✅ Configure HTTPS/TLS in production
- ✅ Enable Railway volume for persistent storage
- ✅ Configure PostgreSQL with SSL
- ✅ Set up Redis with authentication (if used)
- ✅ Configure CORS for your production domain
- ✅ Enable security headers (automatically applied via helmet)
- ✅ Monitor logs for security warnings

## Vulnerability Disclosure Timeline

**Example Timeline**:
1. **Day 0**: Vulnerability reported
2. **Day 1**: Acknowledgment sent, investigation begins
3. **Day 2-3**: Root cause analysis, fix developed
4. **Day 4-5**: Fix tested, security tests added
5. **Day 6**: Fix deployed to production
6. **Day 7**: Public disclosure coordinated with reporter

## Security Audits

**Last Security Audit**: January 2025
**Next Scheduled Audit**: Q2 2025

**Issues Resolved**:
- #21: Hardcoded Salt / Plaintext Password Comparison (CVE 9.1) - ✅ FIXED
- #22: SQL Injection Prevention (CVE 9.8) - ✅ VERIFIED SECURE

**Pending Reviews**:
- #23: Path Traversal (CVE 7.5)
- #24: Timing Attack (CVE 5.9)
- #25: Rate Limiting (CVE 6.5)
- #26: CORS Misconfiguration (CVE 5.3)

## Security Resources

**Documentation**:
- CLAUDE.md - Development security guidelines
- README.md - General project information
- tests/security/ - Security test suites

**External Resources**:
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/sql-prepare.html)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [bcrypt Documentation](https://www.npmjs.com/package/bcrypt)

## License

This security policy applies to Qopy, which is dual-licensed:
- **AGPL-3.0**: For open source use
- **Commercial**: For proprietary use (contact qopy@lit.services)

---

**Last Updated**: January 2025
**Version**: 1.0.0
