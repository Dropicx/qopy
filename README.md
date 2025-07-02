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
- **Persistent storage** with SQLite database
- **Docker volume support** for data persistence

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

### Database Features
- **SQLite database** for persistent storage
- **Automatic data cleanup** of expired clips
- **Access logging** for analytics and security
- **User management** ready for future features
- **Premium subscription** support structure
- **Database migration** tools

## 🛠 Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js with Express
- **Database**: SQLite3 with persistent storage
- **Security**: Helmet, CORS, Rate limiting, Input validation, Spam filtering
- **Additional**: QR code generation, Compression, UUID, Express-validator
- **Deployment**: Docker with volume persistence

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

3. **Initialize database**
   ```bash
   npm run db:init
   ```

4. **Start the server**
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

5. **Access the application**
   - Main App: `http://localhost:3000`
   - Admin Dashboard: `http://localhost:3000/api/admin/dashboard`
   - Health Check: `http://localhost:3000/api/health`

### Database Setup

The application now uses SQLite for persistent storage. The database is automatically created in the `data/` directory.

**Initialize database:**
```bash
npm run db:init
```

**Migrate existing data (if needed):**
```bash
npm run db:migrate
```

**Database location:**
- Development: `./data/qopy.db`
- Docker: `/app/data/qopy.db` (mounted volume)

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

### Docker (Recommended)

**With Docker Compose (includes volume persistence):**
```bash
# Build and run with persistent storage
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop the application
docker-compose down
```

**Manual Docker build:**
```bash
# Build image
docker build -t qopy .

# Run with volume for data persistence
docker run -d \
  --name qopy \
  -p 3000:3000 \
  -v qopy_data:/app/data \
  -e NODE_ENV=production \
  -e DB_PATH=/app/data/qopy.db \
  qopy
```

### Railway (Cloud Deployment)

**One-Click Deploy:**
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/deploy)

**Manual Deploy:**
1. Create a new project on [Railway.app](https://railway.app)
2. Connect your GitHub repository
3. Railway automatically detects Node.js and deploys
4. Access your app at the provided Railway domain

**Railway-Specific Configuration:**
- **Database**: Uses `/tmp/qopy.db` for ephemeral filesystem compatibility
- **Auto-setup**: Database automatically initializes on each deployment
- **Health checks**: Configured at `/api/health` with 30s timeout
- **Environment**: Automatically sets `NODE_ENV=production` and `RAILWAY_ENVIRONMENT=true`
- **Zero-downtime**: Automatic deployments with health check validation

**⚠️ Railway Limitations:**
- **Ephemeral filesystem**: Database is recreated on each deployment
- **No persistent storage**: Clips are lost on redeploy (temporary clips only)
- **Memory limits**: Optimized for Railway's memory constraints

**For persistent storage on Railway, consider:**
- Using Railway's PostgreSQL plugin for production
- Implementing external database (MongoDB Atlas, PlanetScale, etc.)
- Using Railway's persistent volume feature (if available)

### Environment Variables

Required configuration:
- `ADMIN_TOKEN` - Admin dashboard access token (REQUIRED for security - no default)

Database configuration:
- `DB_PATH` - SQLite database path (default: `./data/qopy.db`)

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

## 🗄️ Database Schema

The application uses SQLite with the following tables:

### clips
- `id` - Primary key
- `clip_id` - 6-character unique identifier
- `content` - The shared text content
- `password_hash` - Optional password hash
- `expiration_time` - Unix timestamp when clip expires
- `created_at` - Creation timestamp
- `accessed_at` - Last access timestamp
- `access_count` - Number of times accessed
- `one_time` - Boolean for one-time access
- `is_expired` - Boolean for expired status
- `created_by_ip` - IP address of creator
- `user_agent` - User agent of creator

### users (for future features)
- `id` - Primary key
- `username` - Unique username
- `email` - Unique email address
- `password_hash` - Hashed password
- `created_at` - Account creation timestamp
- `last_login` - Last login timestamp
- `is_active` - Account status
- `is_admin` - Admin privileges
- `subscription_type` - Premium subscription type
- `subscription_expires` - Subscription expiration

### user_clips (for linking clips to users)
- `id` - Primary key
- `user_id` - Foreign key to users table
- `clip_id` - Foreign key to clips table
- `created_at` - Link creation timestamp

### access_logs (for analytics and security)
- `id` - Primary key
- `clip_id` - Foreign key to clips table
- `ip_address` - IP address of accessor
- `user_agent` - User agent of accessor
- `accessed_at` - Access timestamp
- `success` - Boolean for successful access
- `error_message` - Error message if access failed

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
GET /api/clip/X8K2M9
```

**Response:**
```json
{
  "success": true,
  "content": "Your shared content",
  "expiresAt": 1640995200000,
  "oneTime": false,
  "hasPassword": true
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
  "uptime": 1234.567,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "port": 3000,
  "environment": "production",
  "railway": true,
  "version": "database-1.0.0",
  "memory": {...},
  "pid": 12345,
  "database": "SQLite",
  "totalClips": 150,
  "activeClips": 45
}
```

## 🔮 Future Features

The database structure is designed to support upcoming features:

### User Management
- User registration and authentication
- Personal clip history
- User preferences and settings
- Account management

### Premium Subscriptions
- Extended expiration times
- Higher content limits
- Advanced analytics
- Priority support
- Custom domains

### Enhanced Analytics
- Detailed access logs
- User behavior tracking
- Performance metrics
- Security monitoring

## 🛡️ Security Features

- **Rate limiting** to prevent abuse
- **Spam filtering** with IP blacklisting
- **Content analysis** for suspicious patterns
- **Password protection** for sensitive clips
- **One-time access** for secure sharing
- **Automatic cleanup** of expired content
- **Access logging** for security monitoring

## 📊 Monitoring

### Admin Dashboard
Access the admin dashboard at `/api/admin/dashboard` with your admin token to view:
- Total clips and active clips
- Database statistics
- Recent activity
- System health metrics

### Health Checks
The application provides health check endpoints:
- `/api/health` - Detailed system status
- `/api/ping` - Simple uptime check

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review the admin dashboard for system status

---

**Qopy** - Secure, fast, and reliable text sharing for everyone. 