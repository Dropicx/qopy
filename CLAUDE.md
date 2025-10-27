# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Qopy is an enterprise-grade secure temporary text and file sharing application with client-side AES-256-GCM encryption, zero-knowledge architecture, and automatic expiration. The application uses Node.js/Express backend with PostgreSQL database, optional Redis caching, and vanilla JavaScript frontend.

**Key Security Features:**
- Client-side encryption (server never sees plaintext)
- Hybrid security: URL secrets (16-char fragments) + optional passwords
- PBKDF2 key derivation (100,000 iterations)
- SQL injection protection via parameterized queries
- bcrypt admin authentication (cost factor 12)
- CORS protection and rate limiting

## Development Commands

### Essential Commands

```bash
# Install dependencies
npm install

# Start development server with auto-reload
npm run dev

# Start production server
npm start

# Run all tests
npm test

# Run tests in watch mode
npm test:watch

# Run tests with coverage report
npm test:coverage

# Run specific test suites
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only

# Database migration
npm run migrate
```

### Environment Setup

Required environment variables:
```bash
DATABASE_URL="postgresql://user:password@localhost:5432/qopy"
NODE_ENV="development"
PORT=8080

# Optional
ADMIN_TOKEN="your-secure-token"
REDIS_URL="redis://localhost:6379"
RAILWAY_VOLUME_MOUNT_PATH="./uploads"
```

### Running Single Tests

```bash
# Run specific test file
npm test -- tests/unit/specific-test.js

# Run tests matching pattern
npm test -- --testNamePattern="describe block name"

# Run security tests
npm test tests/security/sql-injection.test.js
```

## Architecture Overview

### Core Application Structure

**Monolithic Architecture**: Single `server.js` (3000+ lines) contains all Express routes and main application logic. Services are extracted for reusability but core routing remains centralized.

**Key Components:**
- `server.js` - Main application entry, Express setup, all API routes, database initialization, cleanup jobs
- `services/` - Business logic modules (FileService, EncryptionService, QuickShareService, etc.)
- `middleware/` - Request processing middleware (accessValidation.js)
- `config/` - Configuration modules (redis.js for Redis singleton)
- `public/` - Static files served to clients (HTML, CSS, fonts, logos)
- `utils/` - Utility functions
- `tests/` - Comprehensive test suites

### Database Layer

**PostgreSQL** with connection pooling (20 production/10 dev connections):

```javascript
// Connection pool optimization in server.js
const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 20, // Production connections
    min: 5,  // Minimum baseline
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    maxUses: 7500 // Prevent memory leaks
});
```

**Primary Tables:**
- `clips` - Encrypted content with metadata (clip_id, content BYTEA, expiration_time, password_hash, one_time flag)
- `statistics` - Usage analytics and metrics
- `files` - File metadata for uploads

**CRITICAL**: All database queries use parameterized queries (`$1, $2, etc.`) to prevent SQL injection. Never use string concatenation or template literals in SQL.

### Caching Layer

**Redis** (optional): Centralized singleton manager in `config/redis.js` handles:
- Upload session management
- Progress tracking for multi-part uploads
- Graceful fallback when unavailable
- Automatic cleanup and memory leak prevention

```javascript
// Usage example
const redis = require('./config/redis');
if (redis.isConnected()) {
    await redis.set(key, value, ttl);
}
```

### File Upload System

**Multi-part upload architecture**:
1. **Initiate** (`/api/upload/initiate`) - Create upload session, store metadata
2. **Chunk** (`/api/upload/chunk/:uploadId/:chunkNumber`) - Upload 5MB encrypted chunks
3. **Complete** (`/api/upload/complete/:uploadId`) - Assemble chunks, verify integrity

**Storage Paths:**
- `RAILWAY_VOLUME_MOUNT_PATH/chunks/` - Temporary chunk storage
- `RAILWAY_VOLUME_MOUNT_PATH/files/` - Assembled files
- `RAILWAY_VOLUME_MOUNT_PATH/temp/` - Multer temporary processing

**Key Services:**
- `FileService.js` - File operations and streaming
- `RefactoredFileUploadManager.js` - Upload orchestration
- `FileAssemblyService.js` - Chunk assembly and verification
- `UploadValidator.js` - Upload validation logic

### Security Architecture

**Defense in Depth:**

1. **Client-Side Encryption** (public/index.html):
   - AES-256-GCM encryption before transmission
   - PBKDF2 key derivation (100k iterations)
   - IV prepended to ciphertext
   - URL secrets in fragment (never transmitted to server)

2. **SQL Injection Prevention** (`server.js` + all services):
   ```javascript
   // ✅ ALWAYS use parameterized queries
   await pool.query('SELECT * FROM clips WHERE clip_id = $1', [clipId]);

   // ❌ NEVER do this
   await pool.query(`SELECT * FROM clips WHERE clip_id = '${clipId}'`);
   ```

3. **Admin Authentication** (`server.js:47`, `server.js:2593-2680`):
   - bcrypt hashing at server startup (cost 12)
   - Global `adminTokenHash` variable
   - `requireAdminAuth` middleware
   - Constant-time comparison via bcrypt.compare()

4. **Rate Limiting** (multiple layers):
   - Global rate limiter
   - Share endpoint limiter (5 req/min)
   - File upload limiter (3 req/min)
   - Admin limiter (20 req/15min)

5. **Input Validation**:
   - express-validator on all endpoints
   - Whitelist validation for enums
   - Content size limits (100KB text, 100MB files)

### Automatic Maintenance

**Cleanup Jobs** (configured in `server.js`):
- Expired clips cleanup - every 5 minutes
- Database statistics update - every 5 minutes
- Old file cleanup - periodic removal of expired files

**Database Migrations**: Automatically run on server startup via `initializeDatabase()` function.

## Code Patterns and Conventions

### Error Handling Pattern

```javascript
try {
    const result = await pool.query('SELECT ...', [params]);
    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.json({ success: true, data: result.rows[0] });
} catch (error) {
    console.error('❌ Error description:', error);
    res.status(500).json({ error: 'Internal error', message: error.message });
}
```

### Database Query Pattern

**Always use parameterized queries:**
```javascript
// For single value
const result = await pool.query(
    'SELECT * FROM clips WHERE clip_id = $1',
    [clipId]
);

// For multiple values
const result = await pool.query(
    'INSERT INTO clips (clip_id, content, expiration_time) VALUES ($1, $2, $3) RETURNING *',
    [clipId, content, expirationTime]
);
```

### Service Module Pattern

```javascript
class ServiceName {
    async methodName(param) {
        try {
            // Logic here
            return result;
        } catch (error) {
            console.error('❌ Error:', error);
            throw error; // Re-throw for caller to handle
        }
    }
}

module.exports = ServiceName;
// or
module.exports = new ServiceName(); // Singleton
```

### Validation Middleware Pattern

```javascript
const validateInput = [
    body('field').isString().trim().notEmpty(),
    body('optional').optional().isInt(),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

app.post('/endpoint', validateInput, async (req, res) => {
    // Handler logic
});
```

## Testing Guidelines

**Test Structure**: `tests/` directory organized by type:
- `unit/` - Service and utility tests
- `integration/` - API endpoint tests
- `security/` - Security validation tests
- `fixtures/` - Test data
- `helpers/` - Test utilities and setup

**Coverage Requirements** (jest.config.js):
- Minimum 40% coverage for all metrics
- Run `npm test:coverage` to generate HTML report in `coverage/`

**Test Utilities**: `tests/helpers/setup.js` contains common test setup and mocks.

## Important Notes

### Security Considerations

1. **SQL Injection**: This is the #1 security priority. ALL database queries MUST use parameterized queries. See `SECURITY.md` and `tests/security/sql-injection.test.js`.

2. **Admin Authentication**: The `adminTokenHash` global variable is set ONCE at server startup in `startServer()`. Never compare passwords in plaintext.

3. **Client-Side Encryption**: True zero-knowledge only works through web interface. Direct API calls receive plaintext content (encrypted server-side).

4. **File Security**: Uploaded files are encrypted client-side. Server stores encrypted binary data. One-time files are deleted after download.

### Performance Considerations

1. **Connection Pooling**: Optimized for 20 concurrent connections in production. Don't increase without load testing.

2. **Redis Caching**: Optional but recommended for production. Application gracefully degrades without Redis.

3. **File Cleanup**: Automatic cleanup prevents storage exhaustion. Don't disable cleanup jobs.

4. **Rate Limiting**: Prevents abuse. Adjust limits based on actual usage patterns.

### Deployment Notes

**Railway Platform**:
- PostgreSQL plugin required
- Volume mount for file storage (`RAILWAY_VOLUME_MOUNT_PATH`)
- Redis plugin optional
- Automatic deployments from main branch

**Docker Support**: Multi-stage Dockerfile available for containerized deployments.

**Health Checks**: Available at `/health`, `/api/health`, and `/ping` for monitoring.

## Common Development Tasks

### Adding a New API Endpoint

1. Add route to `server.js` with appropriate rate limiter
2. Add express-validator validation middleware
3. Use parameterized queries for database access
4. Add error handling with appropriate HTTP status codes
5. Add integration test to `tests/integration/`
6. Update API documentation in README.md

### Adding a New Service

1. Create service file in `services/` directory
2. Follow class-based pattern with error handling
3. Export as singleton or class
4. Import in `server.js` or other services
5. Add unit tests in `tests/unit/`

### Database Schema Changes

1. Write SQL migration in `scripts/database-migration.sql`
2. Test migration locally
3. Update `initializeDatabase()` in `server.js` if needed
4. Run `npm run migrate` or restart server (auto-migrates)
5. Update relevant documentation

### Debugging

**Enable verbose logging**:
```javascript
// server.js already has extensive console.log statements
// Look for emoji indicators:
// ✅ Success operations
// ❌ Error conditions
// ⚠️ Warnings
// 🔍 Debug information
// 🧹 Cleanup operations
```

**Database queries**: PostgreSQL logs can be enabled via environment variables.

**Redis debugging**: Check connection status with `redisManager.isConnected()`.

## License

Dual-licensed: AGPL-3.0 for open source, Commercial license for proprietary use. Contact: qopy@lit.services
