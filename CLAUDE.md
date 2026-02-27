# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Qopy is a privacy-first, enterprise-grade secure temporary text and file sharing application with client-side encryption, zero-knowledge architecture, and automatic expiration. Built with Express.js, PostgreSQL, and optional Redis caching.

**Key Security Features**:
- AES-256-GCM client-side encryption with PBKDF2 key derivation (600,000 iterations, OWASP 2025 compliant)
- Zero-knowledge architecture - server never sees plaintext content
- Hybrid security: URL secrets + optional passwords for defense in depth
- Binary database storage (BYTEA) with direct binary transmission (no base64 overhead)

**Dual License**: AGPL-3.0 for open source use, Commercial license: contact qopy.quiet156@passmail.net

## Common Commands

### Development
```bash
npm run dev              # Start with nodemon for hot reload
npm start                # Production server
npm run build            # Install dependencies
```

### Testing
```bash
npm test                 # Run all tests (Jest)
npm run test:unit        # Run unit tests only (333 test cases)
npm run test:integration # Run integration tests (15+ scenarios)
npm run test:watch       # Watch mode for TDD
npm run test:coverage    # Generate coverage report (>80% coverage target)

# Run specific test file
npm test tests/unit/services/FileService.test.js

# Run specific test pattern
npm test -- --testNamePattern="should handle large files"
```

### Database
```bash
npm run migrate                    # Run database migrations manually
npm run test-migration             # Test migration script
psql $DATABASE_URL -f scripts/database-migration.sql  # Direct migration
```

## Architecture

### Current State: Transitioning to Service-Oriented
The codebase is actively migrating from a monolithic `server.js` (3,403 lines) to a service-oriented architecture following SOLID principles. This transition improves testability and maintainability.

### Core Components

**Main Application**:
- `server.js` - Express app with routes, middleware, and business logic
- `routes/` - Extracted route modules (health.js, static.js)
- `migrations/run.js` - Database migrations (run on startup)
- Graceful shutdown handling for PostgreSQL and Redis connections

**Services Directory** (`services/`):
Services follow Single Responsibility Principle and are dependency-injectable:

**Core Services**:
- `FileService.js` - File retrieval, streaming, range requests, content-type detection
- `EncryptionService.js` - Encryption validation, access code processing (75 test cases)
- `QuickShareService.js` - Quick share mode with 6-char codes, 5-min expiration (45 test cases)
- `StorageService.js` - Database operations, file storage abstraction (23 test cases)
- `FileAssemblyService.js` - Multi-part file assembly, size validation (50 test cases)

**Validation Services**:
- `UploadValidator.js` - Request parsing, system detection, data integrity (80 test cases)
- `AccessValidator.js` - Access validation middleware for clip retrieval
- `ShareValidationMiddleware.js` - Share creation validation
- `ContentProcessor.js` - Content processing and sanitization

**Repository Pattern**:
- `UploadRepository.js` - Upload session data persistence

**Payment System** (Future Monetization):
- `AnonymousPaymentService.js` - Anonymous payment processing
- `PaymentController.js` - Payment workflow orchestration
- `PaymentSecurityValidator.js` - Payment security validation
- `SubscriptionRepository.js` - Subscription data management

**Middleware** (`middleware/`):
- `accessValidation.js` - Centralized access validation using AccessValidator service

**Configuration** (`config/`):
- `redis.js` - Centralized Redis connection manager (prevents memory leaks)

### Database Schema

PostgreSQL with two main tables:

**clips table**:
```sql
id SERIAL PRIMARY KEY
clip_id VARCHAR(10) UNIQUE NOT NULL  -- 6-char (quick) or 10-char (enhanced)
content BYTEA NOT NULL                -- Binary encrypted content
password_hash VARCHAR(60)             -- Bcrypt hash (if password-protected)
expiration_time BIGINT NOT NULL       -- Unix timestamp
created_at BIGINT NOT NULL
accessed_at BIGINT
access_count INTEGER DEFAULT 0
one_time BOOLEAN DEFAULT FALSE
is_expired BOOLEAN DEFAULT FALSE
```

**statistics table**:
```sql
total_clips BIGINT DEFAULT 0
total_accesses BIGINT DEFAULT 0
password_protected_clips BIGINT DEFAULT 0
quick_share_clips BIGINT DEFAULT 0
one_time_clips BIGINT DEFAULT 0
normal_clips BIGINT DEFAULT 0
last_updated BIGINT DEFAULT 0
```

**Connection Pool Optimization**:
- Production: max 20, min 5 connections (reduced from 100 for 80% less memory)
- Development: max 10, min 2 connections
- `idleTimeoutMillis: 30000` - Close idle connections after 30s
- `maxUses: 7500` - Recreate connection after 7500 queries (memory leak prevention)

### File Upload Architecture

**Chunk Upload System** (for files up to 100MB):

1. **Client-side**: File encrypted as whole → Split into 5MB chunks → Upload sequentially
2. **Server-side**: Receive chunks via multer (6MB limit for overhead) → Store temporarily → Assemble → Validate

**Critical Implementation Detail**:
- Chunk size: 5MB (`CHUNK_SIZE = 5 * 1024 * 1024`)
- Multer limit: 6MB (`CHUNK_SIZE + 1MB buffer`) to handle encryption overhead (IV + auth tag)
- Storage path: `RAILWAY_VOLUME_MOUNT_PATH` or `./uploads` with subdirs: `chunks/`, `files/`, `temp/`

**Upload Flow**:
```
POST /api/upload/initiate → uploadId generated
POST /api/upload/chunk/:uploadId/:chunkNumber → chunk stored
POST /api/upload/complete/:uploadId → assemble & validate
```

### Client-Side Encryption Flow

**Enhanced Security Mode** (default):
1. URL secret generated (256-bit high-entropy passphrase) → never transmitted to server
2. Combined secret = URL secret + password (if provided)
3. Random 256-bit salt + 96-bit IV generated per clip
4. AES-256-GCM encryption with PBKDF2-derived key (600k iterations, per-clip random salt)
5. V3 payload: [version:1 byte][salt:32 bytes][IV:12 bytes][ciphertext]
6. Share URL: `/clip/{clipId}#{urlSecret}` (fragment never sent to server)

**Quick Share Mode**:
- 6-character clip IDs for fast sharing
- 5-minute fixed expiration
- URL secret in fragment (6-char, never sent to server)
- Same zero-knowledge guarantees as Enhanced mode

**Zero-Knowledge Guarantees**:
- Server never sees plaintext content
- Server never sees passwords (not even hashed)
- Server never sees URL secrets
- Random IV per encryption operation (no IV reuse risk)
- Per-clip random salts (NIST SP 800-132 compliant)

## Testing Strategy

### Test Organization
```
tests/
├── unit/
│   ├── services/         # Service unit tests (333 total test cases)
│   └── middleware/       # Middleware tests
├── integration/
│   ├── api/             # API integration tests (15+ scenarios)
│   └── chunk-upload-*.test.js  # 5 specialized chunk upload test files
├── helpers/
│   ├── setup.js         # Test environment configuration
│   ├── database.js      # Database test utilities
│   └── mocks.js         # Mock objects
└── fixtures/
    └── sample-data.js   # Test data fixtures
```

### Testing Best Practices

**Unit Tests**:
- Use Jest with mocks for external dependencies
- Test services in isolation with dependency injection
- Focus on business logic, not integration
- Mock PostgreSQL pool and Redis client

**Integration Tests**:
- Use real database connections (test schema)
- Test service interactions and workflows
- Validate end-to-end scenarios
- Setup/teardown database state

**Coverage Goals**:
- Maintain >85% code coverage
- 100% coverage for security-critical services (EncryptionService, AccessValidator)
- All services should have corresponding test files

## Important Development Notes

### Security Considerations

**Never log or expose**:
- Plaintext content
- Passwords or access codes
- URL secrets (fragment identifiers)
- Decrypted file content

**Always validate**:
- Encryption parameters (IV length, algorithm)
- File sizes and chunk counts before assembly
- Access permissions before content retrieval
- Expiration times before serving content

### Performance Optimization

**Database**:
- Use connection pooling (configured in server.js)
- Run cleanup job every 5 minutes for expired clips
- Index on `clip_id` for fast lookups

**Redis** (optional):
- Used as a read cache for upload sessions (PostgreSQL is the primary store)
- Centralized manager in `config/redis.js` prevents memory leaks
- Graceful fallback to PostgreSQL-only when unavailable

**File Operations**:
- Stream large files instead of loading into memory
- Clean up temporary chunks after assembly
- Use `fs-extra` for async filesystem operations

### Railway Deployment

**Required Environment Variables**:
- `DATABASE_URL` - PostgreSQL connection string (auto-set by Railway)
- `NODE_ENV=production`
- `ADMIN_TOKEN` - For admin dashboard access
- `RAILWAY_VOLUME_MOUNT_PATH` - Volume path for file storage

**Optional Environment Variables**:
- `PORT` - Server port (default: `3000`, auto-set by Railway)
- `REDIS_URL` - Redis connection string (auto-set by Railway; falls back to PostgreSQL-only)
- `REDISCLOUD_URL` - Alternative Redis URL (checked if `REDIS_URL` is not set)
- `DATABASE_SSL_REJECT_UNAUTHORIZED` - TLS certificate verification for PostgreSQL. Defaults to `false` (Railway uses self-signed certs). Set to `true` for providers with CA-signed certs
- `PBKDF2_SALT` - Custom salt for PBKDF2 key derivation (default: built-in salt). Used in zero-knowledge client-side hashing via `/api/config`
- `LOG_LEVEL` - Logging verbosity (default: `info`)

**Payment System Variables** (required only if Stripe integration is enabled):
- `STRIPE_SECRET_KEY` - Stripe API secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- `STRIPE_BASIC_PRICE_ID` - Stripe price ID for Basic plan
- `STRIPE_PRO_PRICE_ID` - Stripe price ID for Pro plan
- `STRIPE_ENTERPRISE_PRICE_ID` - Stripe price ID for Enterprise plan

**Volume Setup**:
1. Add Volume plugin in Railway dashboard
2. Mount at persistent path (e.g., `/var/lib/containers/railwayapp/bind-mounts/...`)
3. Set `RAILWAY_VOLUME_MOUNT_PATH` environment variable
4. Server automatically creates subdirectories: `chunks/`, `files/`, `temp/`

**Automatic Startup Tasks**:
- Database schema migration
- Storage directory initialization
- Connection pool configuration
- Expired content cleanup job

### Code Style

**Services**:
- Single Responsibility Principle - one concern per service
- Dependency injection via constructor parameters
- Async/await for all asynchronous operations
- Comprehensive error handling with specific error types

**Error Handling**:
- Use try-catch blocks with specific error types
- Log errors with context but never sensitive data
- Return meaningful HTTP status codes (400, 404, 500)
- Provide user-friendly error messages

**Database Operations**:
- Always use parameterized queries (`$1, $2`) to prevent SQL injection
- Close database connections in finally blocks
- Use transactions for multi-step operations
- Handle connection pool errors gracefully

## Admin Dashboard

Access at `/admin.html` with admin token authentication.

**Features**:
- Real-time statistics
- Database health monitoring
- Recent clips overview
- System performance metrics

**Authentication**:
- Token-based via `Authorization: Bearer {ADMIN_TOKEN}` header
- No session management
- Validate on each request

## API Endpoints

**Content Upload (3-Step Flow)**:
- `POST /api/upload/initiate` - Initialize upload session
- `POST /api/upload/chunk/:uploadId/:chunkNumber` - Upload single chunk
- `POST /api/upload/complete/:uploadId` - Complete and assemble file

**Content Retrieval**:
- `GET /api/clip/:clipId/info` - Get clip metadata (no decryption)
- `GET /api/clip/:clipId` - Retrieve encrypted content
- `POST /api/file/:clipId` - Download file content

**Health Checks**:
- `GET /health` - Application health
- `GET /api/health` - API health with database check
- `GET /ping` - Simple ping

## Troubleshooting

**Database Connection Issues**:
- Check `DATABASE_URL` environment variable
- Verify PostgreSQL is running and accessible
- Check connection pool configuration in server.js
- Review connection limits (20 max in production)

**File Upload Failures**:
- Verify storage directories exist and are writable
- Check `RAILWAY_VOLUME_MOUNT_PATH` is set correctly
- Ensure multer limit (6MB) exceeds chunk size (5MB)
- Review disk space availability

**Test Failures**:
- Ensure PostgreSQL is running for integration tests
- Check test database connection string
- Clear test database between runs
- Verify mock objects match service interfaces

**Redis Connection**:
- Redis is optional - app works without it
- Check logs for "Using centralized Redis manager" vs "continuing without cache"
- Graceful degradation to PostgreSQL-only session storage
- Use `redisManager.connect()` for controlled initialization
