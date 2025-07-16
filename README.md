# Qopy - Secure Temporary Text Sharing

Qopy is a privacy-first, secure temporary text sharing web application with client-side encryption and automatic expiration.

## 🔐 Security Features

### Client-Side Encryption
- **AES-256-GCM encryption** for all content
- **Zero-knowledge architecture** - server never sees plaintext content
- **PBKDF2 key derivation** for password-protected clips
- **No password transmission** - passwords never leave the client
- **Deterministic IV derivation** - IV derived from password, not transmitted
- **Optimized storage format** - direct byte concatenation, 40% less overhead
- **Hybrid security** - URL secrets + passwords for enhanced protection
- **Binary database storage** - encrypted content stored as BYTEA for efficiency and security
- **Direct binary transmission** - no base64 overhead, raw bytes sent to server

### Password Security
- **Client-only encryption** - passwords used only for content encryption
- **No server authentication** - content is already encrypted, no need for password verification
- **PBKDF2 with 100,000 iterations** for key derivation
- **Deterministic IV derivation** with 50,000 iterations for password-protected clips
- **Zero password transmission** to server
- **URL secret enhancement** - 16-character random secret in URL fragment adds extra security layer

### Privacy Protection
- **No IP tracking** or user-agent logging
- **No content analysis** or storage
- **Automatic expiration** with cleanup
- **One-time access** option
- **HTTPS-only** operation
- **Client-side QR generation** - QR codes generated locally, no external API calls

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

# Initialize database
npm run db:init

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

# Initialize production database
railway run npm run db:init

# Migrate existing data to binary storage (if upgrading)
railway run npm run db:migrate-binary
```

## 📋 API Endpoints

### Create Share
```http
POST /api/share
Content-Type: application/json

{
  "content": "encrypted-content-base64",
  "expiration": "30min",
  "oneTime": false,
  "hasPassword": true
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

## ⚠️ Important API Security Note

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
  clip_id VARCHAR(6) UNIQUE NOT NULL,
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

### Password Flow
1. **User enters password** in browser
2. **URL secret generated** automatically (16-character random string)
3. **Combined secret created** from URL secret + password
4. **Content encrypted** with AES-256-GCM + PBKDF2-derived key from combined secret
5. **IV derived deterministically** from combined secret (not transmitted)
6. **Share URL includes secret** as fragment (e.g., `/clip/abc123#x7y9z2...`)
7. **Encrypted content sent** to server (no password transmitted)
8. **Server stores encrypted content** without ability to decrypt

### Content Encryption
1. **Content encrypted** client-side with AES-256-GCM
2. **URL secret + password combined** for enhanced security
3. **IV derived from combined secret** for password-protected clips (deterministic)
4. **Random IV** for non-password clips
5. **Direct byte concatenation** (IV + encrypted data + key if needed)
6. **Raw binary transmission** to server (no base64 encoding overhead)
7. **BYTEA storage** in database for maximum efficiency
8. **Client decrypts** content when retrieved using URL secret + password

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

# Production monitoring
npm run monitor
```

### Database Maintenance
```bash
# Check database status
npm run db:check

# Migrate passwords (if needed)
npm run db:migrate-passwords

# Clean up expired clips (automatic)
# Runs every 5 minutes in production
```

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