# Qopy - Secure Text Sharing

A modern, secure, and privacy-focused web application for temporary text sharing. Share text snippets, code, or any content with automatic expiration and optional password protection.

## 🚀 Features

### Core Functionality
- **6-character unique ID generation** for each shared clip
- **Configurable expiration times**: 5min, 15min, 30min, 1hr, 6hr, 24hr
- **Instant sharing** with immediate link generation
- **QR code generation** for easy mobile sharing
- **Copy-to-clipboard functionality** for all shared content
- **Mobile-first responsive design**

### Security & Privacy
- **No permanent storage** - everything expires automatically
- **Optional password protection** for sensitive content
- **One-time access option** (self-destruct after first read)
- **Advanced spam filtering** with 68,000+ blocked IPs
- **Rate limiting** to prevent abuse (20 requests per 15min)
- **Input sanitization** and XSS protection
- **No content logging** beyond expiration time
- **Secure headers** with Helmet.js and CSP

### User Experience
- **Dark/light theme toggle** with persistent preferences
- **Clean, minimalist interface** 
- **Character counter** with visual feedback (up to 100,000 chars)
- **Toast notifications** for user feedback
- **Keyboard shortcuts** for power users
- **Auto-cleanup** of expired clips
- **URL routing** for direct clip access
- **Admin dashboard** for system monitoring

## 🛠 Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js with Express
- **Database**: In-memory storage (Map)
- **Security**: Helmet, CORS, Rate limiting, Input validation, Spam filtering
- **Additional**: QR code generation, Compression, UUID, Express-validator

## 📦 Installation & Setup

### Prerequisites
- **Node.js 18.0.0** or higher
- **npm 11.4.2** or higher (required for optimal performance)

> 💡 **Important**: Qopy requires npm >= 11.4.2 for security and performance optimizations.

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd qopy
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

4. **Access the application**
   - Main App: `http://localhost:3000`
   - Admin Dashboard: `http://localhost:3000/api/admin/dashboard`
   - Health Check: `http://localhost:3000/api/health`

### npm Version Management

Check your npm version:
```bash
npm --version
npm run check-npm
```

Upgrade npm if needed:
```bash
# Method 1: Direct upgrade
npm install -g npm@latest

# Method 2: Using Volta (recommended)
volta install node@20.10.0
volta install npm@11.4.2

# Method 3: Using nvm
nvm install node
nvm use node
```

## 🚀 Deployment

### Railway (Recommended)

**One-Click Deploy:**
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/deploy)

**Manual Deploy:**
1. Create a new project on [Railway.app](https://railway.app)
2. Connect your GitHub repository
3. Railway automatically detects Node.js and deploys
4. Access your app at the provided Railway domain

**Configuration:**
- Railway automatically provides `PORT` and `NODE_ENV=production`
- Health checks are configured at `/api/health`
- Zero-downtime deployments included

### Docker

```bash
# Build and run with Docker Compose
docker-compose up -d --build

# Or build manually
docker build -t qopy .
docker run -p 3000:3000 qopy
```

### Environment Variables

Required configuration:
- `ADMIN_TOKEN` - Admin dashboard access token (REQUIRED for security - no default)

CORS & Security configuration:
- `DOMAIN` - Your custom domain (automatically added to CORS allowlist)
- `ALLOWED_ORIGINS` - Additional allowed origins (comma-separated, e.g., "https://app1.com,https://app2.com")
- `RAILWAY_STATIC_URL` - Railway auto-generated domain (automatically detected)
- `RAILWAY_PUBLIC_DOMAIN` - Railway custom domain (automatically detected)
- **Production**: `qopy.app` is automatically included in CORS allowlist

Optional configuration:
- `RATE_LIMIT_WINDOW_MS` - Rate limiting window (default: 900000ms)
- `RATE_LIMIT_MAX_REQUESTS` - Max requests per window (default: 20)
- `MAX_CONTENT_LENGTH` - Maximum content length (default: 100000)
- `SPAM_FILTER_ENABLED` - Enable spam filtering (default: true)

## 🖥 Usage

### Sharing Content

1. Navigate to the **Share tab**
2. Enter your content (up to 100,000 characters)
3. Select expiration time from dropdown
4. Optional settings:
   - ☑️ "Self-destruct after first read" for one-time access
   - 🔒 Enter password for additional security
5. Click **"Create Share Link"**
6. Share the generated URL or QR code

### Retrieving Content

1. Navigate to the **Retrieve tab**
2. Enter the 6-character clip ID
3. Enter password if required
4. Click **"Retrieve Content"**
5. Copy the retrieved content using the copy button

### Direct Access

Share URLs have the format: `https://your-domain.com/clip/X8K2M9`

Recipients can click the link to go directly to the retrieve interface.

## 🔧 API Documentation

### Create Clip
```http
POST /api/clip
Content-Type: application/json

{
  "content": "Your content here",
  "expiration": "30min",
  "oneTime": false,
  "password": "optional-password"
}
```

**Response:**
```json
{
  "success": true,
  "clipId": "X8K2M9",
  "shareUrl": "https://your-domain.com/clip/X8K2M9",
  "qrCode": "data:image/png;base64,...",
  "expiresAt": 1640995200000,
  "expiresIn": 1800000,
  "oneTime": false,
  "hasPassword": true
}
```

### Retrieve Clip
```http
GET /api/clip/:id
```

For password-protected clips:
```http
POST /api/clip/:id
Content-Type: application/json

{
  "password": "clip-password"
}
```

**Response:**
```json
{
  "success": true,
  "content": "Your retrieved content",
  "createdAt": 1640993400000,
  "expiresAt": 1640995200000,
  "oneTime": false
}
```

### Health Check
```http
GET /api/health
```

**Response:**
```json
{
  "status": "OK",
  "uptime": 3600.123,
  "activeClips": 42,
  "timestamp": "2023-12-31T23:59:59.000Z",
  "version": "fixed-1.0.2",
  "ipBlacklist": {
    "totalBlockedIPs": 68200,
    "sources": ["spamhaus", "emerging-threats"]
  },
  "spamFilter": {
    "enabled": true,
    "stats": {
      "totalAnalyzed": 1250,
      "blocked": 89,
      "suspicious": 156
    }
  }
}
```

## 🛡️ Admin Dashboard

Access the admin dashboard at `/admin` with the admin token.

**Security**: You MUST set the `ADMIN_TOKEN` environment variable. No default token is provided for security reasons.

**Features:**
- 📊 **System Statistics** - Active clips, blocked IPs, spam statistics
- 🚫 **IP Management** - View and manage blocked IPs
- 📋 **System Logs** - Real-time application logs
- 📈 **Spam Statistics** - Detailed spam filtering metrics
- ⚙️ **System Information** - Server status and debug information

## 🔒 Security Features

### Spam Protection
- **68,000+ blocked IPs** from Spamhaus and Emerging Threats
- **50+ content categories** filtered (phishing, malware, illegal content)
- **Pattern detection** for credit cards, SSNs, suspicious URLs
- **Heuristic analysis** for spam patterns
- **Auto-IP blacklisting** for high spam scores

### Rate Limiting
- **20 requests per 15 minutes** for clip creation
- **100 requests per 15 minutes** for clip retrieval
- **IP-based tracking** with automatic blocking

### Content Security Policy
- **Strict CSP headers** preventing XSS attacks
- **Secure inline script handling** for admin dashboard
- **HTTPS enforcement** in production

### Input Validation
- **Express-validator** integration
- **Content sanitization** and length limits
- **Password strength validation**
- **Malicious content detection**

## 🚦 Monitoring & Maintenance

### Health Monitoring
- **Automatic health checks** every 10 seconds
- **Memory monitoring** with warnings at 100MB heap
- **Uptime tracking** and restart policies
- **Graceful shutdown** handling

### Logging System
- **Structured logging** with timestamps and metadata
- **In-memory log storage** (1000 entries)
- **Log level filtering** (error, warn, info, debug)
- **Admin dashboard integration**

### Automatic Cleanup
- **Expired clips removal** every 5 minutes
- **Memory optimization** with V8 heap monitoring
- **Spam IP list updates** every 24 hours

## 🛠 Development

### Available Scripts
```bash
npm start          # Start production server
npm run dev        # Start development server with auto-reload
npm run check-npm  # Verify npm version requirements
npm test           # Run tests (placeholder)
npm run health-check      # Manual health check
npm run update-spam-ips   # Update spam IP lists
npm run setup-admin       # Setup admin configuration
```

### Project Structure
```
qopy/
├── server-fixed.js       # Main server file
├── package.json          # Dependencies and scripts
├── railway.toml          # Railway deployment config
├── Dockerfile           # Docker configuration
├── public/              # Frontend files
│   ├── index.html       # Main application
│   ├── admin.html       # Admin dashboard
│   ├── script.js        # Frontend JavaScript
│   └── styles.css       # Styling
├── scripts/             # Utility scripts
│   ├── health-check.js  # Health check script
│   ├── spam-ip-updater.js # Spam IP list updater
│   └── setup-admin.js   # Admin setup utility
└── data/
    └── spam-ips.json    # Spam IP database
```

## 🚨 Troubleshooting

### Common Issues

**Build Failures:**
- Ensure npm >= 11.4.2: `npm run check-npm`
- Clear cache: `npm cache clean --force`
- Reinstall: `rm -rf node_modules && npm install`

**Port Issues:**
- App automatically uses `process.env.PORT` or defaults to 3000
- Ensure no other services are using the port

**Admin Dashboard Not Loading:**
- Check CSP errors in browser console
- Set admin token via `ADMIN_TOKEN` environment variable (required)
- Clear browser cache and cookies

**Memory Issues:**
- App includes automatic memory monitoring
- Check `/api/health` for memory statistics
- Restart if heap usage exceeds limits

**Spam Filter False Positives:**
- Use admin dashboard to manage IP blacklist
- Adjust spam score thresholds via environment variables
- Check logs for detailed spam analysis

## 📈 Performance

- **Memory-efficient**: ~9MB RAM usage in production
- **Fast response times**: <100ms for most operations
- **Scalable**: Handles thousands of concurrent clips
- **CDN-ready**: Static files optimized for CDN delivery
- **Compression**: Gzip compression for all responses

## 🔄 Updates & Maintenance

### Automatic Updates
- **Spam IP lists**: Updated every 24 hours
- **Security patches**: Apply via npm update
- **Railway deployments**: Automatic on git push

### Manual Maintenance
```bash
# Update spam IP lists
npm run update-spam-ips

# Check system health
npm run health-check

# View admin dashboard
# https://your-domain.com/api/admin/dashboard
```

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

- **Health Check**: `/api/health`
- **Admin Dashboard**: `/api/admin/dashboard`
- **Railway Support**: [Railway Discord](https://discord.gg/railway)
- **Documentation**: This README and inline code comments

---

**Qopy** - Secure, fast, and privacy-focused text sharing. 🚀 