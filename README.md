# Qopy - Enterprise-Grade Secure Temporary Text & File Sharing

Qopy is a privacy-first, secure temporary text and file sharing web application with enterprise-grade client-side encryption, zero-knowledge architecture, and automatic expiration. Built with modern web technologies and optimized for both development and production environments.

## Security Features

### Enterprise-Grade Client-Side Encryption
- **AES-256-GCM encryption** for all content with PBKDF2 key derivation (100,000 iterations)
- **Zero-knowledge architecture** - server never sees plaintext content
- **Hybrid security system** - URL secrets + passwords for defense in depth
- **Deterministic IV derivation** - IV derived from combined secrets, not transmitted
- **Binary database storage** - encrypted content stored as BYTEA for efficiency
- **Direct binary transmission** - no base64 overhead, raw bytes sent to server
- **Client-side QR generation** - QR codes generated locally, no external API calls

### Advanced Security Architecture
- **URL secrets** - 16-character random secrets in URL fragments for enhanced protection
- **Password protection** - Optional passwords with 100,000 PBKDF2 iterations
- **Combined secrets** - URL secret + password combined for maximum security
- **No password transmission** - passwords never leave the client
- **Defense in depth** - Even weak passwords protected by URL secret
- **Automatic expiration** with guaranteed cleanup every minute
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
- **4-character codes** for ultra-fast sharing
- **5-minute expiration** for temporary content
- **No URL secrets** - simplified sharing for non-sensitive content
- **Still encrypted** - content remains secure with client-side encryption
- **Perfect for** - quick code snippets, temporary notes, instant sharing

### Enhanced Security Mode
- **10-character codes** for enhanced security
- **URL secrets** - 16-character random secrets in URL fragments
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
- **POST /api/share** - Create new encrypted content
- **POST /api/upload/initiate** - Initialize file upload session
- **POST /api/upload/chunk/:uploadId/:chunkNumber** - Upload file chunk
- **POST /api/upload/complete/:uploadId** - Complete file upload
- **GET /api/clip/:clipId/info** - Get clip information
- **GET /api/clip/:clipId** - Retrieve encrypted content
- **GET /api/file/:clipId** - Retrieve file content
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
- **Automatic cleanup** - Expired content removal every 5 minutes

### Deployment & Infrastructure
- **Docker support** - Multi-stage Dockerfile for production
- **Railway deployment** - Optimized for Railway platform
- **Health checks** - Automatic health monitoring
- **Graceful shutdown** - Proper resource cleanup
- **Environment configuration** - Flexible environment variable support

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

### Create Share
```http
POST /api/share
Content-Type: application/json

{
  "content": [encrypted-binary-array],
  "expiration": "30min",
  "oneTime": false,
  "hasPassword": true,
  "quickShare": false
}
```

### Get Clip Info
```http
GET /api/clip/{clipId}/info
```

### Retrieve Clip
```http
GET /api/clip/{clipId}
```

### Health Check
```http
GET /health
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
  content BYTEA NOT NULL,
  password_hash VARCHAR(60),
  expiration_time BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  accessed_at BIGINT,
  access_count INTEGER DEFAULT 0,
  one_time BOOLEAN DEFAULT FALSE,
  is_expired BOOLEAN DEFAULT FALSE
);

CREATE TABLE statistics (
  id SERIAL PRIMARY KEY,
  total_clips BIGINT DEFAULT 0,
  total_accesses BIGINT DEFAULT 0,
  password_protected_clips BIGINT DEFAULT 0,
  quick_share_clips BIGINT DEFAULT 0,
  one_time_clips BIGINT DEFAULT 0,
  normal_clips BIGINT DEFAULT 0,
  last_updated BIGINT DEFAULT 0
);
```

## Security Architecture

### Enhanced Security Flow
1. **User enters content** in browser
2. **URL secret generated** automatically (16-character random string)
3. **Combined secret created** from URL secret + password (if provided)
4. **Content encrypted** with AES-256-GCM + PBKDF2-derived key from combined secret
5. **IV generated** (deterministic for password clips, random for others) and prepended to encrypted data
6. **Share URL includes secret** as fragment (e.g., `/clip/abc123#x7y9z2...`)
7. **Encrypted content sent** to server (no password transmitted)
8. **Server stores encrypted content** without ability to decrypt

### Quick Share Flow
1. **User enables Quick Share** mode
2. **4-character ID generated** for ultra-fast sharing
3. **Content encrypted** with standard encryption (no URL secret)
4. **5-minute expiration** automatically set
5. **Simplified sharing** for non-sensitive content

### Zero-Knowledge Guarantees
- Server never sees plaintext content
- Server never sees passwords (not even hashed)
- Server never sees URL secrets
- Server cannot decrypt content
- No content analysis or logging
- Automatic data expiration
- No password authentication needed
- Deterministic IV derivation (for password-protected clips)
- Hybrid security: URL secret + password provides defense in depth

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
- **Expired clip cleanup** - runs every 5 minutes
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
   - Contact: qopy@lit.services

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Company Information

**LIT Services**
- **Website**: https://lit.services
- **Contact**: qopy@lit.services

---

**Qopy** - Secure, private, temporary text sharing. Developed by [LIT Services](https://lit.services).

*Version: minimal-1.0.0 | Last Updated: August 2025*