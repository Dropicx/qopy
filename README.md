# Qopy - Secure Temporary Text Sharing

A modern, secure, and anonymous text sharing service that allows you to share content temporarily without requiring registration. Your content is automatically deleted after a specified time period, ensuring privacy and security.

## 🌟 Features

- **🔒 Secure & Anonymous**: No registration required, no permanent storage
- **⏰ Auto-Expiration**: Content automatically deletes after your chosen time (5min - 24hr)
- **🔐 Password Protection**: Optional password protection for sensitive content
- **🔥 One-Time Access**: Content can self-destruct after first read
- **📱 QR Code Generation**: Easy mobile sharing with generated QR codes
- **🌐 Modern UI**: Beautiful, responsive interface with typing animations
- **🚀 Fast & Reliable**: Built with Node.js, Express, and PostgreSQL
- **🔗 Direct URLs**: Share clips with simple 6-character IDs
- **📱 Mobile Optimized**: Responsive design with touch-friendly interface
- **🔐 Admin Dashboard**: Real-time monitoring and analytics

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL database (Railway PostgreSQL plugin)
- Railway account (for deployment)

### Local Development
```bash
# Clone the repository
git clone https://github.com/yourusername/qopy.git
cd qopy

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database URL

# Start development server
npm run dev
```

### Production Deployment (Railway)
```bash
# Deploy to Railway
railway up

# Check deployment status
railway status

# View logs
railway logs
```

## 📁 Project Structure

```
qopy/
├── public/                 # Frontend assets
│   ├── index.html         # Main application
│   ├── script.js          # Frontend JavaScript (updated with fixes)
│   ├── styles.css         # Styling
│   └── logos/             # Images and favicon
├── scripts/               # Utility scripts
│   ├── db-init.js         # Database initialization
│   ├── test.js            # Deployment testing
│   ├── monitor.js         # Production monitoring
│   ├── health.js          # Health check utility
│   └── db-check.js        # Database connection test
├── server.js              # Main server (production)
├── railway.toml           # Railway configuration
├── Dockerfile             # Railway Dockerfile
└── package.json           # Dependencies and scripts
```

## 🔧 Configuration

### Environment Variables
```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:port/db
PORT=3000
```

### Railway Configuration
The app is configured for Railway deployment with:
- PostgreSQL database plugin
- Automatic health checks
- Production-optimized settings
- No healthcheck configuration for faster startup

## 📊 API Endpoints

### Health & Status
- `GET /health` - Health check with uptime and version
- `GET /ping` - Simple ping response
- `GET /api/health` - API health check

### Core Functionality
- `POST /api/share` - Create a new clip
  ```json
  {
    "content": "Your text content",
    "expiration": "5min|15min|30min|1hr|6hr|24hr",
    "password": "optional_password",
    "oneTime": false
  }
  ```
- `GET /api/clip/:id` - Retrieve a clip (no password)
- `POST /api/clip/:id` - Retrieve a password-protected clip
  ```json
  {
    "password": "your_password"
  }
  ```
- `GET /api/clip/:id/info` - Get clip info (expiration, password status)

### Admin Endpoints
- `GET /api/admin/stats` - System statistics
- `GET /api/admin/clips` - Recent clips list
- `GET /api/admin/system` - System information

### Admin Dashboard
- `GET /admin` - Admin dashboard interface
- **Access**: https://qopy.app/admin
- **Password**: `qopy2024` (demo password)

### Static Files
- `GET /` - Main application
- `GET /clip/:id` - Direct clip access (auto-redirects to retrieve)
- `GET /favicon.ico` - Favicon
- `GET /apple-touch-icon.png` - Apple touch icon

## 🛠️ Development

### Available Scripts
```bash
npm start                    # Start production server
npm run dev                  # Start development server
npm run test                 # Test deployment functionality
npm run monitor              # Monitor production health
npm run db:check             # Check database connection
npm run db:init              # Initialize PostgreSQL database
```

### Testing
```bash
# Test deployment
npm run test

# Monitor production
npm run monitor

# Manual API testing
curl https://qopy.app/health
curl -X POST https://qopy.app/api/share \
  -H "Content-Type: application/json" \
  -d '{"content":"Test","expiration":"5min"}'
```

## 🎯 Frontend Features

### Share Tab
- **Content Input**: Up to 100,000 characters with real-time counter
- **Expiration Options**: 5min, 15min, 30min, 1hr, 6hr, 24hr
- **Security Options**: Password protection, one-time access
- **QR Code Generation**: Automatic QR code for mobile sharing
- **Copy Functions**: Easy copying of URLs and clip IDs

### Retrieve Tab
- **Clip ID Input**: 6-character ID with auto-uppercase
- **Password Support**: Automatic password field detection
- **Auto-Retrieval**: Direct URLs automatically retrieve content
- **Content Display**: Formatted content with metadata
- **Copy Content**: One-click content copying

### URL Routing
- **Direct Access**: `/clip/ABC123` automatically switches to retrieve tab
- **Auto-Fill**: Clip ID is automatically filled in
- **Auto-Retrieve**: Content is automatically retrieved
- **Password Detection**: Password field shown if needed

### User Experience
- **Typing Animation**: Animated logo with typing effect
- **Tab Navigation**: Smooth tab switching with keyboard shortcuts
- **Toast Notifications**: Success and error messages
- **Loading States**: Visual feedback during operations
- **Responsive Design**: Works on all device sizes

## 🔒 Security Features

- **Temporary Database Storage**: Content stored in PostgreSQL with automatic cleanup
- **No User Accounts**: Completely anonymous usage
- **No Content Logging**: We never analyze or mine your text data
- **Guaranteed Deletion**: Content automatically deleted after expiration
- **Rate Limiting**: Production-optimized (3000 requests/15min per IP - supports 1000 users/hour)
- **Input Validation**: Secure input handling and sanitization
- **CORS Protection**: Controlled cross-origin requests
- **Password Hashing**: Secure password storage with plain text comparison
- **Zero IP Tracking**: No IP addresses stored in database - true privacy-first approach

## 🔐 Admin Dashboard

### 📍 Access
- **URL**: https://qopy.app/admin
- **Password**: `qopy2024` (demo password)

### 🎯 Features

#### 📊 Statistics Dashboard
- **Total Clips**: Gesamtzahl aller erstellten Clips
- **Active Clips**: Aktive (nicht abgelaufene) Clips  
- **Expired Clips**: Abgelaufene Clips
- **Total Accesses**: Gesamtzahl aller Zugriffe
- **Password Protected**: Passwort-geschützte Clips
- **One-Time Clips**: Selbstzerstörende Clips

#### 📋 Recent Clips Monitor
- **Live View**: Letzte 20 erstellte Clips
- **Clip Details**: ID, Inhalt (erste 100 Zeichen), Status
- **Status Indicators**: Farbige Indikatoren für aktiv/abgelaufen
- **Metadata**: Erstellungszeit, Zugriffe, Sicherheitsfeatures
- **Security Flags**: Passwort-Schutz und One-Time Status

#### ⚙️ System Information
- **Server Status**: Online/Offline Status
- **Uptime**: Server-Laufzeit
- **Version**: Aktuelle Software-Version
- **Environment**: Production/Development
- **Database**: Verbindungsstatus
- **Last Cleanup**: Letzte Bereinigung abgelaufener Clips

### 🔧 Technical Details

#### Backend APIs
```bash
GET /api/admin/stats      # Get system statistics
GET /api/admin/clips      # Get recent clips (last 20)
GET /api/admin/system     # Get system information
```

#### Frontend Features
- **Auto-Refresh**: Automatic updates every 30 seconds
- **Responsive Design**: Works on all devices
- **Real-time Updates**: Live data without page reload
- **Error Handling**: Graceful error handling

### 🛡️ Security Considerations

#### Current Implementation
- ⚠️ **Simple Password**: `qopy2024` (hardcoded)
- ⚠️ **No Session Management**: Password stored in frontend only
- ⚠️ **No Rate Limiting**: Unlimited login attempts

#### Recommended Improvements
- ✅ **Secure Authentication** with JWT or sessions
- ✅ **Rate Limiting** for login attempts
- ✅ **Environment Variable** for admin password
- ✅ **Audit Logging** for admin actions

### 📊 Usage Example

```bash
# Access admin dashboard
curl -s https://qopy.app/admin

# Get statistics
curl -s https://qopy.app/api/admin/stats | jq .

# Get recent clips
curl -s https://qopy.app/api/admin/clips | jq '.[0:2]'

# Get system info
curl -s https://qopy.app/api/admin/system | jq .
```

### 🎯 Use Cases
- **System Monitoring**: Track application usage and performance
- **Content Moderation**: Monitor recent clips for inappropriate content
- **Analytics**: Understand user behavior and patterns
- **Troubleshooting**: Check system status and database connectivity
- **Maintenance**: Monitor cleanup processes and system health

## 📈 Performance

- **Response Time**: < 1 second for API calls
- **Database Usage**: PostgreSQL with automatic cleanup
- **Memory Usage**: < 50MB typical (database handles storage)
- **Database Connections**: Optimized connection pooling
- **Static Assets**: Compressed and cached
- **Health Checks**: Continuous monitoring
- **Startup Time**: < 5 seconds for production server

## 🚨 Troubleshooting

### Common Issues

#### Health Check Failing
```bash
# Check Railway logs
railway logs

# Test health endpoint
curl https://qopy.app/health
```

#### Database Connection Issues
```bash
# Verify PostgreSQL plugin is added
railway variables

# Test database connection
npm run db:check
```

#### Frontend Issues
- **Direct URLs not working**: Ensure latest version is deployed
- **QR codes not showing**: Check external QR service availability
- **Tab switching issues**: Clear browser cache

#### Admin Dashboard Issues
- **Cannot access admin**: Verify password is `qopy2024`
- **Dashboard not loading**: Check if admin APIs are responding
- **No data showing**: Verify database connection and API endpoints

#### Deployment Problems
```bash
# Check deployment status
railway status

# View build logs
railway logs
```

### Emergency Recovery
```bash
# Restart service
railway up

# Force restart
railway service restart

# Check environment variables
railway variables
```

## 📊 Monitoring

### Health Checks
- Automatic health monitoring at `/health`
- Database connection verification
- Response time monitoring
- Error rate tracking
- System uptime tracking

### Production Monitoring
```bash
# Start continuous monitoring
npm run monitor

# Check Railway dashboard
# https://railway.app/dashboard
```

## 🔄 Deployment

### Railway Deployment
1. Connect your GitHub repository to Railway
2. Add PostgreSQL plugin in Railway dashboard
3. Deploy with `railway up`
4. Monitor deployment with `railway logs`

### Environment Setup
- `NODE_ENV=production`
- `DATABASE_URL` (automatically provided by PostgreSQL plugin)
- `PORT` (automatically set by Railway)

### Recent Updates (January 2024)
- ✅ Fixed frontend routing for direct clip URLs
- ✅ Added QR code generation using external service
- ✅ Improved tab switching and navigation
- ✅ Fixed createdAt field handling
- ✅ Enhanced toast notifications
- ✅ Added debug logging for better troubleshooting
- ✅ Optimized startup time for production

## 📝 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

- **Documentation**: This README
- **Issues**: GitHub Issues
- **Railway Support**: https://docs.railway.app
- **Live Demo**: https://qopy.app

---

**Qopy** - Secure, anonymous, temporary text sharing made simple.

**Version**: minimal-1.0.0  
**Status**: ✅ Production Ready  
**Last Updated**: January 2024  
**Live URL**: https://qopy.app