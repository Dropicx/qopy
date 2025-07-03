# Qopy - Secure Temporary Text Sharing

A modern, secure, and anonymous text sharing service that allows you to share content temporarily without requiring registration. Your content is automatically deleted after a specified time period, ensuring privacy and security.

## 🌟 Features

- **🔒 Secure & Anonymous**: No registration required, no permanent storage
- **⏰ Auto-Expiration**: Content automatically deletes after your chosen time
- **🔐 Password Protection**: Optional password protection for sensitive content
- **🔥 One-Time Access**: Content can self-destruct after first read
- **📱 QR Code Generation**: Easy mobile sharing with generated QR codes
- **🌐 Modern UI**: Beautiful, responsive interface with typing animations
- **🚀 Fast & Reliable**: Built with Node.js, Express, and PostgreSQL

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL database
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
│   ├── script.js          # Frontend JavaScript
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

## 📊 API Endpoints

### Health & Status
- `GET /health` - Health check
- `GET /ping` - Simple ping

### Core Functionality
- `POST /api/share` - Create a new clip
- `GET /api/clip/:id` - Retrieve a clip
- `GET /api/clip/:id/info` - Get clip info

### Static Files
- `GET /` - Main application
- `GET /clip/:id` - Direct clip access
- `GET /favicon.ico` - Favicon

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

## 🔒 Security Features

- **No Permanent Storage**: Content only exists in server memory
- **No User Accounts**: Completely anonymous usage
- **No Content Logging**: We never save or analyze your text
- **Automatic Deletion**: Content disappears after expiration
- **Rate Limiting**: Protection against abuse
- **Input Validation**: Secure input handling
- **CORS Protection**: Controlled cross-origin requests

## 📈 Performance

- **Response Time**: < 1 second for API calls
- **Memory Usage**: < 100MB typical
- **Database Connections**: Optimized connection pooling
- **Static Assets**: Compressed and cached
- **Health Checks**: Continuous monitoring

## 🚨 Troubleshooting

### Common Issues

#### Health Check Failing
```bash
# Check Railway logs
railway logs

# Test health endpoint
curl https://your-app.railway.app/health
```

#### Database Connection Issues
```bash
# Verify PostgreSQL plugin is added
railway variables

# Test database connection
npm run db:check
```

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

---

**Qopy** - Secure, anonymous, temporary text sharing made simple.

**Version**: minimal-1.0.0  
**Status**: ✅ Production Ready  
**Last Updated**: January 2024 