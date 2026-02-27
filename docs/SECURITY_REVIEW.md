# Qopy Security Review

This document provides a structured security review of the Qopy application: threat model, controls in place, and recommendations. It complements [SECURITY.md](../SECURITY.md) (vulnerability reporting and policy) and [CLAUDE.md](../CLAUDE.md) (architecture and security notes).

**Review scope**: Application and API security, data protection, authentication, input validation, and deployment security.  
**Last updated**: February 2026.

---

## 1. Threat Model Summary

| Threat | Mitigation |
|--------|------------|
| **Plaintext exposure** | Zero-knowledge design: server never sees plaintext; client-side AES-256-GCM; URL secret in fragment only. |
| **Access code brute-force** | PBKDF2-SHA-512 (600k iterations) for access code hashing; timing-safe comparison. |
| **Quick Share enumeration** | Quick Share rate limiter (10/min per IP); failed-lookup tracking and temporary IP blocking. |
| **SQL injection** | Parameterized queries only (`$1`, `$2`) across services and routes. |
| **Authentication bypass** | Admin: constant-time comparison for token; clip access: AccessValidator + TokenService. |
| **Abuse / DoS** | Layered rate limiting (general, burst, retrieval, upload initiation, admin auth, file download). |
| **XSS** | CSP via Helmet; `innerHTML` used with app-controlled or sanitized content; no user content rendered unsanitized in critical paths. |
| **Path traversal** | Clip IDs validated (6/10 char alphanumeric); file paths from DB (server-set). Filename in upload path should be sanitized (see Recommendations). |
| **Supply chain** | Dependency audits (e.g. Snyk in CI); Dependabot; review before upgrade. |

---

## 2. Security Controls in Place

### 2.1 Authentication and Authorization

- **Admin dashboard** (`routes/admin.js`):
  - Bearer token in `Authorization` header compared with `crypto.timingSafeEqual` (length + value).
  - Password-based login uses same constant-time comparison.
  - Admin auth rate limited (5 attempts per 15 min per IP).
- **Clip access**:
  - `AccessValidator` + `TokenService`: access code validated via PBKDF2-SHA-512 hash (600k iterations); comparison is timing-safe.
  - Quick Share: no server-side secret; rate limiting and failed-lookup tracking reduce enumeration risk.

### 2.2 Input Validation

- **Clip IDs**: `clipIdValidator` (shared) enforces 6 or 10 chars, `[A-Z0-9]` only — used on clip/file routes.
- **Upload**: express-validator on `/api/upload/initiate` (filename length 1–255, totalChunks 1–20, filesize cap, expiration enum, etc.).
- **Stripe**: Webhook signature verified with `stripe.webhooks.constructEvent` before processing.
- **File download**: `original_filename` sanitized in `FileService.setDownloadHeaders` (path separators, control chars, length cap, quote escaping).

### 2.3 Database and Storage

- **SQL**: All queries use parameterized placeholders; no string concatenation of user input into SQL (verified in AccessValidator, routes, UploadRepository, CleanupService, etc.).
- **File paths**: Stored `file_path` is set server-side on upload (from `STORAGE_PATH`, `uploadId`, and session filename). File streaming uses paths from DB only after access checks.
- **Connection**: Production PostgreSQL over TLS; `DATABASE_SSL_REJECT_UNAUTHORIZED` configurable for CA-verified certs.

### 2.4 HTTP and Client Security

- **Helmet**: CSP (default-src 'self'; script/style/connect/frame/img restricted); HSTS; referrer no-referrer; COOP same-origin; permissions policy (camera, microphone, geolocation, payment disabled or restricted).
- **CORS**: Origin allowlist (localhost in dev; qopy.app and Railway patterns in prod); browser extensions explicitly rejected.
- **Rate limiting** (express-rate-limit):
  - General API: 100/15 min per IP (health and chunk paths skipped).
  - Burst: 60/min.
  - Retrieval: 50/15 min.
  - Quick Share: 10/min for short clip IDs.
  - Upload initiate: 10/15 min.
  - Admin auth: 5/15 min.
  - File download: 50/min.

### 2.5 Cryptography and Secrets

- **Client-side**: AES-256-GCM; per-clip random salt and IV; PBKDF2 (600k iterations) for key derivation; URL secret in fragment only.
- **Server**: No plaintext or URL secrets logged; access codes only as hashes; admin token from env.
- **Stripe**: Webhook secret in env; signature checked before handling.

### 2.6 Logging and Error Handling

- No logging of plaintext content, passwords, URL secrets, or decrypted data.
- Errors logged with context (e.g. path, method) without sensitive payloads.
- Debug logging for file-upload client gated by `FILE_UPLOAD_DEBUG`.

---

## 3. Recommendations

### 3.1 High priority

- **Upload filename path traversal**:  
  `server.js` builds the stored file path as `path.join(STORAGE_PATH, 'files', `${uploadId}_${session.filename}`). If `session.filename` contains path segments (e.g. `../` or `..\\`), normalization can place the file outside the intended directory.  
  **Recommendation**: Sanitize `filename` before use: reject or strip path separators (`/`, `\`), `..`, and null bytes; optionally restrict to a safe character set and length. Apply the same rule when persisting `original_filename` for display/download (FileService already sanitizes for `Content-Disposition`; ensuring the stored value is safe keeps behavior consistent).  
  **Implementation**: `server.js` uses `sanitizeFilenameForPath()` before building the path: path separators and `..` are stripped, control characters removed, length capped at 255. Display name (`original_filename`) remains client-provided and is sanitized in `FileService.setDownloadHeaders` when sending headers.

### 3.2 Medium priority

- **Path canonicalization for file operations**:  
  When reading/deleting by `file_path` from the DB, consider resolving the path and asserting it remains under `STORAGE_PATH` (e.g. `path.resolve(STORAGE_PATH, file_path).startsWith(path.resolve(STORAGE_PATH))` or equivalent) to guard against legacy or corrupted data.  
  **Implementation**: `services/utils/pathSafety.js` provides `resolvePathUnderBase(filePath, basePath)`; it is used in `CleanupService` (before `safeDeleteFile` for expired clips and orphaned files) and in `routes/files.js` (before `fileExists`/`streamFile` for POST `/api/file/:clipId`). `server.js` passes `STORAGE_PATH` into file routes. Paths outside the base are rejected (404 for downloads; cleanup skips and logs).
- **CSP**:  
  `style-src` includes `'unsafe-inline'` for compatibility. If feasible, move to nonce- or hash-based inline styles to tighten CSP.  
  **Implementation**: Left as-is for now. The trade-off and a nonce-based approach are documented in [DEPLOYMENT.md](DEPLOYMENT.md) (Content Security Policy subsection).
- **Dependencies**:  
  Keep using `npm audit` and CI security scans; address high/critical findings within the timelines in SECURITY.md.  
  **Implementation**: SECURITY.md includes a “Dependency security (process)” subsection: CI runs `npm audit --audit-level=high`; high/critical are treated as blocking unless documented.

### 3.3 Lower priority

- **Admin token**:  
  Ensure `ADMIN_TOKEN` is strong and unique per environment; consider rotation and storage in a secrets manager in production.  
  **Implementation**: Documented in SECURITY.md (“Admin token and Redis”) and in DEPLOYMENT.md (production checklist).
- **Redis**:  
  When used, ensure Redis URL and credentials are not exposed (env only, TLS if available).  
  **Implementation**: Documented in SECURITY.md (“Admin token and Redis”) and in DEPLOYMENT.md (production checklist).
- **File streaming**:  
  FileService streams by path from DB; defense-in-depth is improved by the path canonicalization check above.  
  **Implementation**: Covered by path canonicalization in file routes (see 3.2).

---

## 4. Security Testing

- **Unit tests**: AccessValidator (parameterized queries, 401 vs 404), admin routes (timing-safe auth, rate limit), TokenService, EncryptionService, FileService (header sanitization).
- **Integration tests**: Chunk upload security (path traversal, tampering, cleanup); API integration with access control.
- **Manual**: Encryption and date-display tests in `tests/manual/`.

Running the full suite before release is recommended:

```bash
npm test
npm run test:integration
```

---

## 5. References

- [SECURITY.md](../SECURITY.md) — Supported versions, reporting process, response timeline, configuration notes.
- [CLAUDE.md](../CLAUDE.md) — Architecture, encryption flow, DB schema, env vars, security notes.
- [docs/DEPLOYMENT.md](DEPLOYMENT.md) — Production checklist, DB SSL, headers.
- [docs/TESTING.md](TESTING.md) — Test layout and practices.
