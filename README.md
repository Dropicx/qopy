# Qopy - Enterprise-Grade Secure Temporary Text & File Sharing

Qopy is a privacy-first, secure temporary text and file sharing web application with enterprise-grade client-side encryption, zero-knowledge architecture, and automatic expiration. Built with modern web technologies and optimized for both development and production environments.

## How Sharing Works (Peer → Server → Peer)

The diagram below shows the full flow for **text or file** sharing: encryption and optional chunking on the sender’s device, transport and storage on the server (which never sees plaintext or the URL secret), and decryption only in the recipient’s browser.

```mermaid
flowchart TB
    subgraph SENDER["👤 Sender (Browser)"]
        A1[Enter text or select file]
        A2[Generate URL secret<br/>256-bit random, never sent to server]
        A3[Optional: enter access code]
        A4[Combine secret: urlSecret + accessCode]
        A5[Derive key: PBKDF2-SHA256<br/>600k iterations, random 32-byte salt]
        A6[Encrypt: AES-256-GCM<br/>random 96-bit IV per clip]
        A7[Build V3 payload:<br/>version + salt + IV + ciphertext]
        A8{Content type?}
        A9[Split into 5MB chunks<br/>file only]
        A10[POST /api/upload/initiate<br/>metadata only, no plaintext]
        A11[POST /api/upload/chunk/:id/:n<br/>one request per chunk]
        A12[POST /api/upload/complete/:id<br/>optional: accessCodeHash for validation]
        A13[Receive clipId + build share URL<br/>/clip/{clipId}#{urlSecret}]
        A1 --> A2
        A2 --> A3
        A3 --> A4
        A4 --> A5
        A5 --> A6
        A6 --> A7
        A7 --> A8
        A8 -->|Text or small file| A10
        A8 -->|File > 5MB| A9
        A9 --> A10
        A10 --> A11
        A11 --> A12
        A12 --> A13
    end

    subgraph SERVER["🖥️ Server & Database"]
        B1[Create upload session<br/>store in DB/Redis]
        B2[Store chunks on disk<br/>temp directory]
        B3[Validate all chunks received]
        B4[Assemble file, verify size]
        B5[Store clip: DB row + encrypted file on disk<br/>BYTEA or file_path]
        B6[Return clipId to client]
        B7[Optional: store access_code_hash only<br/>never plaintext access code]
        B1 --> B2
        B2 --> B3
        B3 --> B4
        B4 --> B5
        B5 --> B6
        B5 --> B7
    end

    subgraph RECIPIENT["👤 Recipient (Browser)"]
        C1[Open share link<br/>URL secret stays in fragment #]
        C2[GET /api/clip/:clipId/info<br/>expiry, requiresAccessCode]
        C3{Access code required?}
        C4[Hash access code client-side<br/>send accessCodeHash only]
        C5[GET or POST /api/clip/:clipId<br/>get redirectTo /api/file/:clipId]
        C6[GET or POST /api/file/:clipId<br/>receive encrypted bytes]
        C7[Parse V3: version, salt, IV, ciphertext]
        C8[Derive key: PBKDF2 + urlSecret from URL]
        C9[Decrypt: AES-256-GCM]
        C10[Display text or download file]
        C1 --> C2
        C2 --> C3
        C3 -->|Yes| C4
        C3 -->|No| C5
        C4 --> C5
        C5 --> C6
        C6 --> C7
        C7 --> C8
        C8 --> C9
        C9 --> C10
    end

    A10 -.->|initiate| B1
    A11 -.->|chunks| B2
    A12 -.->|complete| B3
    B6 -.->|clipId| A13
    C5 -.->|metadata| B5
    C6 -.->|encrypted content| B5
```

**Takeaways:**

- **Sender:** Plaintext and URL secret never leave the browser. Optional access code is hashed (PBKDF2-SHA-512) before send; only the hash is used for server-side access checks.
- **Server:** Sees only encrypted payloads, chunk blobs, and optional access-code hashes. It cannot decrypt content (no URL secret) and does not log or store plaintext.
- **Recipient:** Gets ciphertext via API; decryption runs in the browser using the URL secret from the link fragment (`#...`), which the browser does not send to the server.

## Security Features

### Enterprise-Grade Client-Side Encryption
- **AES-256-GCM encryption** for all content with PBKDF2 key derivation (600,000 iterations, OWASP 2025 compliant)
- **Zero-knowledge architecture** - server never sees plaintext content
- **Hybrid security system** - URL secrets + passwords for defense in depth
- **Per-clip random salts** - 256-bit cryptographically random salt per encryption operation
- **Random IV generation** - 96-bit cryptographically random IV per encryption operation
- **Binary database storage** - encrypted content stored as BYTEA for efficiency
- **Direct binary transmission** - no base64 overhead, raw bytes sent to server
- **Client-side QR generation** - QR codes generated locally, no external API calls

### Advanced Security Architecture
- **URL secrets** - High-entropy random secrets in URL fragments (256-bit for Enhanced, 31-bit for Quick Share)
- **Password protection** - Optional access codes hashed with 600,000 PBKDF2-SHA-512 iterations before leaving the browser (using a shared salt so server can verify without seeing the code)
- **Combined secrets** - URL secret + access code combined for maximum security
- **No plaintext password transmission** - only a PBKDF2-SHA-512 hash is sent to the server for access validation (the server cannot reverse this to recover the original code). This access-code hashing uses a separate salt from content encryption (content uses per-clip random salt).
- **Defense in depth** - Even weak access codes protected by URL secret
- **Automatic expiration** with cleanup every minute
- **One-time access** option for sensitive content
- **Rate limiting** - Multi-layered protection against abuse

### Privacy Protection
- **No IP tracking** or user-agent logging
- **No content analysis** or storage
- **Temporary rate limiting** - IP addresses processed only in memory
- **HTTPS-only** operation with secure headers
- **GDPR compliant** architecture
- **CORS protection** - Blocks browser extensions and unauthorized origins

## Core Features

### Quick Share Mode
- **6-character codes** for ultra-fast sharing
- **5-minute expiration** for temporary content
- **URL secrets** - 6-character secrets in URL fragments (never sent to server)
- **Same encryption** - AES-256-GCM with PBKDF2, same as Enhanced Security (shorter codes, ideal for quick peer sharing)
- **True zero-knowledge** - same encryption model as Enhanced Security
- **Perfect for** - quick code snippets, temporary notes, instant sharing with peers

### Enhanced Security Mode
- **10-character codes** for enhanced security
- **URL secrets** - 256-bit (32 random bytes, base64-encoded) secrets in URL fragments
- **Flexible expiration** - 5 minutes to 24 hours
- **Access code protection** - optional additional security layer
- **Perfect for** - sensitive documents, confidential information, long-term sharing

### User Experience
- **No registration required** - instant sharing
- **Mobile-optimized** - responsive design with QR codes
- **Modern UI** - Spotify-inspired interface with smooth animations
- **Keyboard shortcuts** - Ctrl/Cmd + 1/2 for tab switching
- **Auto-retrieval** - direct links automatically load content
- **Character counter** - real-time content length tracking (100,000 char limit)
- **Copy functionality** - one-click copying of URLs, IDs, and content
- **Typing animation** - engaging logo animation on homepage
- **File upload support** - drag-and-drop interface for files up to 100MB
- **Progress tracking** - real-time upload progress with resume capability

### Advanced Features
- **QR Code sharing** - client-side QR generation for mobile access
- **Content validation** - automatic content sanitization and validation
- **Error handling** - comprehensive error messages and recovery
- **Loading states** - visual feedback during operations
- **Toast notifications** - user-friendly success/error messages
- **FAQ system** - built-in help and information
- **Privacy notice** - GDPR-compliant privacy information
- **Multi-part file uploads** - large files split into secure chunks
- **Redis caching** - optional performance enhancement for upload sessions

## Technical Features

### API Endpoints
- **POST /api/upload/initiate** - Initialize file upload session
- **POST /api/upload/chunk/:uploadId/:chunkNumber** - Upload file chunk
- **POST /api/upload/complete/:uploadId** - Complete file upload
- **GET /api/clip/:clipId/info** - Get clip information
- **GET /api/clip/:clipId** - Retrieve encrypted content
- **POST /api/file/:clipId** - Retrieve file content
- **GET /health** - Application health check
- **GET /api/health** - API health check
- **GET /ping** - Simple ping endpoint

### Admin Dashboard
- **Protected admin interface** - Secure admin authentication
- **Real-time statistics** - Live usage metrics and analytics
- **System monitoring** - Database health and system status
- **Recent clips overview** - Latest content management
- **Performance metrics** - Uptime and response time tracking

### Database Features
- **PostgreSQL optimization** - Connection pooling and performance tuning
- **Automatic migrations** - Database schema management
- **Sequence management** - Automatic ID sequence optimization
- **Statistics tracking** - Comprehensive usage analytics
- **Automatic cleanup** - Expired content removal every minute (clips deleted after 5-minute post-expiration grace period)

### Deployment & Infrastructure
- **Docker support** - Multi-stage Dockerfile for production
- **Railway deployment** - Optimized for Railway platform
- **Health checks** - Automatic health monitoring
- **Graceful shutdown** - Proper resource cleanup
- **Environment configuration** - Flexible environment variable support

### Documentation
- **[docs/](docs/README.md)** - Deployment, architecture, testing, security, and historical docs (see [docs/README.md](docs/README.md) for the full index).

## Quick Start

### Prerequisites
- Node.js 20+ (Volta configuration included)
- PostgreSQL database
- Railway account (for deployment)

### Local Development
```bash
# Clone repository
git clone https://github.com/your-username/qopy.git
cd qopy

# Install dependencies
npm install

# Set up environment variables
export DATABASE_URL="postgresql://user:password@localhost:5432/qopy"
export NODE_ENV="development"

# Start development server
npm run dev
```

### Production Deployment
```bash
# Deploy to Railway
railway up

# Set production environment variables
railway variables set NODE_ENV=production
railway variables set ADMIN_TOKEN=your-secure-admin-token

# The server automatically handles database migrations and cleanup
```

## API Documentation

### Upload Content (3-Step Flow)

When using the API directly, content is sent as **plaintext** (no client-side encryption). The server stores it as provided.

**Step 1: Initiate upload**
```http
POST /api/upload/initiate
Content-Type: application/json

{
  "filename": "message.txt",
  "filesize": 26,
  "totalChunks": 1,
  "expiration": "1hr",
  "oneTime": false,
  "hasPassword": false
}
```
Response includes `uploadId` (16 chars). Use it in step 2.

**Step 2: Upload chunk**
```http
POST /api/upload/chunk/{uploadId}/{chunkNumber}
Content-Type: multipart/form-data
```
Body: form field `chunk` = the file (plaintext). Example: `curl -F "chunk=@message.txt"`.

**Step 3: Complete upload**
```http
POST /api/upload/complete/{uploadId}
Content-Type: application/json
Body: {}
```
Response includes `clipId` and `url`.

### Retrieving Clips

**Get clip metadata**
```http
GET /api/clip/{clipId}/info
```

**Get clip (returns JSON with redirectTo for file content)**
```http
GET /api/clip/{clipId}
```

**Download file content** — use **POST** (GET /api/file/:clipId returns 410 Gone). For unprotected clips, send empty JSON.
```http
POST /api/file/{clipId}
Content-Type: application/json
Body: {}
```
For password-protected clips, include `"accessCode": "your-code"` in the body.

### Health Check
```http
GET /health
```

### Testing the API with the included script

A shell script runs a full store-and-retrieve test using the plaintext API: it uploads the text "Hello from Qopy API test", then retrieves it and verifies the content.

**Prerequisites:** `curl` and `node` (for JSON parsing).

**Run against qopy.app:**
```bash
./scripts/test-api-curl.sh https://qopy.app
```

**Run against local server:**
```bash
./scripts/test-api-curl.sh http://localhost:8080
```

Example output when all steps succeed:
```
Qopy API test (curl, plaintext per FAQ)
Base URL: https://qopy.app

1. Health check
   OK
2. Initiate upload
   uploadId: ...
   Before upload (plaintext): Hello from Qopy API test
3. Upload chunk (plaintext)
   chunk uploaded
4. Complete upload
   clipId: ...
5. Get clip
   redirectTo: /api/file/...
6. Get file
   After retrieve (plaintext): Hello from Qopy API test
7. Verify
   Match: OK

All steps OK (plaintext API).
```

## Important Security Note

**Client-side encryption is only available through the web interface.** When using the API directly (e.g., with curl), content is sent as plaintext to the server and then encrypted server-side. This means:

- **Web interface**: True client-side encryption (content encrypted in browser)
- **Direct API calls**: Server-side encryption only (content sent as plaintext)

For maximum security, always use the web interface at `https://qopy.app` for client-side encryption.

## Configuration

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string (required)
- `NODE_ENV`: Environment (development/production)
- `ADMIN_TOKEN`: Admin authentication token
- `PORT`: Server port (default: 8080)

### Database Schema
```sql
CREATE TABLE clips (
  id SERIAL PRIMARY KEY,
  clip_id VARCHAR(10) UNIQUE NOT NULL,
  content_type VARCHAR(20) DEFAULT 'text',
  file_path VARCHAR(500),              -- path to encrypted file on disk
  original_filename VARCHAR(255),
  mime_type VARCHAR(100),
  filesize BIGINT,
  password_hash VARCHAR(255),          -- legacy column (not used for access code validation)
  access_code_hash VARCHAR(255),       -- PBKDF2-SHA-512 hash (128 hex chars) of the access code
  requires_access_code BOOLEAN DEFAULT FALSE,
  expiration_time BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  accessed_at BIGINT,
  access_count INTEGER DEFAULT 0,
  one_time BOOLEAN DEFAULT FALSE,
  is_expired BOOLEAN DEFAULT FALSE,
  quick_share BOOLEAN DEFAULT FALSE,
  is_file BOOLEAN DEFAULT FALSE
);
```

## Security Architecture

### How Encryption Works (explained simply)

Think of Qopy like a locked box system:

1. **You write a secret message** on your device
2. **Your browser generates a random key** (the URL secret) and locks the box with it
3. **The locked box is sent to our server** — we store it but have no key, so we can't open it
4. **You share a link** that contains the key hidden in the `#fragment` — browsers never send the part after `#` to the server
5. **The recipient's browser uses the key** from the link to unlock the box and read the message

**The server only ever touches the locked box. It never sees the key, and it never sees the message.**

### Enhanced Security Flow (technical detail)
1. **User enters content** in browser
2. **URL secret generated** — 32 cryptographically random bytes, base64-encoded (~44 chars, 256 bits of entropy)
3. **Random salt + IV generated** per clip — 256-bit salt, 96-bit IV (both unique per encryption)
4. **Encryption key derived** — PBKDF2 with 600,000 iterations stretches the URL secret into an AES-256 key. This makes brute-force attacks computationally expensive.
5. **Content encrypted** with AES-256-GCM — the same algorithm banks and governments use. GCM mode ensures both confidentiality (can't read it) and integrity (can't tamper with it).
6. **V3 payload created** — version byte + salt + IV + ciphertext packed into a single binary blob
7. **Share URL includes secret** as fragment (e.g., `/clip/abc123#x7y9z2...`) — the `#` fragment is never sent to the server by any browser
8. **Only encrypted bytes reach the server** — the server stores them without any ability to decrypt

### Quick Share Flow
1. **User enables Quick Share** mode
2. **6-character ID generated** for fast sharing
3. **6-character URL secret generated** client-side — ~31 bits of entropy (shorter than Enhanced mode's 256-bit, but still zero-knowledge since the server never sees it)
4. **Content encrypted** with AES-256-GCM using PBKDF2-derived key from URL secret
5. **5-minute expiration** automatically set
6. **Share URL includes secret** as fragment (e.g., `/clip/X8K2M9#AB7K9P`)

### What the Server Sees vs. What It Doesn't

| | Server sees | Server does NOT see |
|---|---|---|
| **Your content** | Encrypted ciphertext (random-looking bytes) | Plaintext content — ever |
| **URL secret** | Never — the `#fragment` is not transmitted by browsers | The decryption key |
| **Access code** | A PBKDF2-SHA-512 hash (600k iterations) — computationally infeasible to reverse | The plaintext access code |
| **Filenames** | A random hash (e.g., `a7f3b2c9`) | Real filenames — encrypted inside the payload |
| **File types** | `application/octet-stream` | Real MIME types — encrypted inside the payload |
| **IP addresses** | In-memory only for rate limiting | Never stored in database or logs |
| **Encryption keys** | Never | Derived in your browser, used there, never transmitted |

### Zero-Knowledge Guarantees
- **Server never sees plaintext content** — all encryption happens in your browser before upload
- **Server never sees URL secrets** — kept in the URL fragment (`#`), which browsers never transmit
- **Server never sees plaintext access codes** — only a PBKDF2-SHA-512 hash (600,000 iterations) is sent for access validation. The server cannot reverse this hash to recover your code. (Access-code hashing uses a shared fixed salt so client and server hashes match; it is separate from content encryption, which uses a random salt per clip.)
- **Server cannot decrypt content** — it would need the URL secret (which it never receives) to derive the decryption key
- **Random IV per encryption** — a fresh 96-bit IV is generated for every clip, eliminating IV reuse risks
- **Per-clip random salts** — 256-bit cryptographically random salt per clip for **content** key derivation prevents rainbow table attacks
- **Hybrid security** — URL secret + access code combined means even a weak access code is protected by the high-entropy URL secret
- **Automatic data expiration** — encrypted content is permanently deleted after your chosen expiration time

## Monitoring & Analytics

### Health Checks
```bash
# Check application health
curl https://your-app.railway.app/health

# Check API health
curl https://your-app.railway.app/api/health

# Simple ping
curl https://your-app.railway.app/ping
```

### Admin Dashboard
- **Access**: `/admin.html` with admin token authentication
- **Statistics**: Real-time usage metrics and analytics
- **System monitoring**: Database health and performance
- **Recent activity**: Latest clips and access patterns

### Automatic Maintenance
- **Database migrations** - handled automatically on server start
- **Expired clip cleanup** - runs every minute (deletes clips 5 minutes after expiration)
- **Rate limiting** - multi-layered protection against abuse
- **Connection pooling** - optimized database performance
- **Graceful shutdown** - proper resource cleanup

## Internationalization

### Multi-Language Support
- **English** - Primary language with full feature set
- **German** - Complete German translation (`features-de.html`)
- **Localized content** - Region-specific features and information

### SEO Optimization
- **Structured data** - JSON-LD schema markup
- **Meta tags** - Comprehensive SEO meta information
- **Sitemap** - Automatic sitemap generation
- **Robots.txt** - Search engine optimization
- **Canonical URLs** - Proper URL canonicalization

## License

This project is dual-licensed:

1. **GNU Affero General Public License v3.0 (AGPL-3.0)**
   - For open source use
   - See [LICENSE-AGPL](LICENSE-AGPL) for details

2. **Commercial License**
   - For proprietary/commercial use
   - Contact: qopy.quiet156@passmail.net

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Contact

**Achim Lenz**
- **Contact**: qopy.quiet156@passmail.net

---

**Qopy** - Secure, private, temporary text and file sharing. Developed by Achim Lenz.

*Last Updated: February 2026*