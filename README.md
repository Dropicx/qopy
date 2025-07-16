# Qopy - Secure Temporary Text Sharing

Qopy is a privacy-first, secure temporary text sharing web application with military-grade client-side encryption, zero-knowledge architecture, and automatic expiration.

## 🔐 Security Features

### Military-Grade Client-Side Encryption
- **AES-256-GCM encryption** for all content with PBKDF2 key derivation
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
- **Automatic expiration** with guaranteed cleanup
- **One-time access** option for sensitive content

### Privacy Protection
- **No IP tracking** or user-agent logging
- **No content analysis** or storage
- **Temporary rate limiting** - IP addresses processed only in memory
- **HTTPS-only** operation
- **GDPR compliant** architecture

## 🚀 Features

### Quick Share Mode
- **4-character codes** for ultra-fast sharing
- **5-minute expiration** for temporary content
- **No URL secrets** - simplified sharing for non-sensitive content
- **Still encrypted** - content remains secure

### Normal Mode
- **10-character codes** for enhanced security
- **URL secrets** - 16-character random secrets in URL fragments
- **Flexible expiration** - 5 minutes to 24 hours
- **Password protection** - optional additional security layer

### User Experience
- **No registration required** - instant sharing
- **Mobile-optimized** - responsive design with QR codes
- **Modern UI** - Spotify-inspired interface
- **Keyboard shortcuts** - Ctrl/Cmd + 1/2 for tab switching
- **Auto-retrieval** - direct links automatically load content

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
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

# The server automatically handles database migrations
```

## 📋 API Endpoints

### Create Share
```http
POST /api/share
Content-Type: application/json

{
  "content": "encrypted-content-array",
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

## ⚠️ Important Security Note

**Client-side encryption is only available through the web interface.** When using the API directly (e.g., with curl), content is sent as plaintext to the server and then encrypted server-side. This means:

- ✅ **Web interface**: True client-side encryption (content encrypted in browser)
- ❌ **Direct API calls**: Server-side encryption only (content sent as plaintext)

For maximum security, always use the web interface at `https://qopy.app` for client-side encryption.

## 🔧 Configuration

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
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
```

## 🛡️ Security Architecture

### Enhanced Security Flow
1. **User enters content** in browser
2. **URL secret generated** automatically (16-character random string)
3. **Combined secret created** from URL secret + password (if provided)
4. **Content encrypted** with AES-256-GCM + PBKDF2-derived key from combined secret
5. **IV derived deterministically** from combined secret (not transmitted)
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
- ✅ Server never sees plaintext content
- ✅ Server never sees passwords (not even hashed)
- ✅ Server never sees URL secrets
- ✅ Server cannot decrypt content
- ✅ No content analysis or logging
- ✅ Automatic data expiration
- ✅ No password authentication needed
- ✅ IV not transmitted (derived deterministically)
- ✅ Hybrid security: URL secret + password provides defense in depth

## 📊 Monitoring

### Health Checks
```bash
# Check application health
curl https://your-app.railway.app/health

# Check API health
curl https://your-app.railway.app/api/health
```

### Automatic Maintenance
- **Database migrations** - handled automatically on server start
- **Expired clip cleanup** - runs every 5 minutes
- **Rate limiting** - multi-layered protection against abuse

## 📄 License

This project is dual-licensed:

1. **GNU Affero General Public License v3.0 (AGPL-3.0)**
   - For open source use
   - See [LICENSE-AGPL](LICENSE-AGPL) for details

2. **Commercial License**
   - For proprietary/commercial use
   - Contact: qopy@lit.services

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

- **Email**: qopy@lit.services
- **Issues**: [GitHub Issues](https://github.com/your-username/qopy/issues)
- **Documentation**: [Wiki](https://github.com/your-username/qopy/wiki)

---

**Qopy** - Secure, private, temporary text sharing. Built with ❤️ by [LIT Services](https://lit.services).