# Railway Deployment Guide for Qopy

## 🚀 Quick Setup

### 1. Add PostgreSQL Database
1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Select your Qopy project
3. Click **"New"** → **"Database"** → **"PostgreSQL"**
4. Wait for database provisioning (2-3 minutes)

### 2. Railway automatically provides:
- `DATABASE_URL` environment variable
- Database connection to your app
- SSL configuration for production

### 3. Redeploy your application
- Railway will automatically redeploy when you add the database
- Or manually trigger a new deployment

## 🔧 Troubleshooting

### Error: "DATABASE_URL environment variable is required"

**Solution:** Add PostgreSQL database to your Railway project (see step 1 above)

### Check Database Connection
```bash
# Run this locally to test database connection
npm run db:check
```

### Manual Database Check on Railway
1. Go to Railway dashboard
2. Select your project
3. Go to "Variables" tab
4. Verify `DATABASE_URL` exists and has a value

## 📊 Database Structure

The application creates these tables automatically:
- `clips` - Main clips storage
- `users` - User management (future feature)
- `user_clips` - User-clip relationships
- `access_logs` - Access tracking and analytics

## 🔒 Security Features

- SSL connections in production
- Connection pooling
- Rate limiting
- Input validation
- SQL injection protection

## 📈 Monitoring

- Health checks every 10 seconds
- Database connection monitoring
- Error logging
- Access analytics

## 🛠️ Development vs Production

| Environment | Database | Storage | SSL |
|-------------|----------|---------|-----|
| Development | SQLite | Local file | No |
| Production | PostgreSQL | Railway managed | Yes |

## 📝 Environment Variables

Railway automatically provides:
- `DATABASE_URL` - PostgreSQL connection string
- `RAILWAY_ENVIRONMENT` - Environment identifier
- `NODE_ENV` - Set to "production"

## 🚨 Important Notes

1. **Never commit DATABASE_URL** - Railway handles this automatically
2. **Database is persistent** - Clips survive redeployments
3. **Automatic backups** - Railway provides database backups
4. **SSL required** - Production connections use SSL

## 🔄 Migration from SQLite

If you were using SQLite locally:
1. Your local data stays intact
2. Railway uses fresh PostgreSQL database
3. No data migration needed for new deployment

## 📞 Support

If you encounter issues:
1. Check Railway logs in dashboard
2. Verify DATABASE_URL exists
3. Ensure PostgreSQL plugin is added
4. Check database connection with `npm run db:check`

# Railway Deployment Guide

This guide explains how to deploy Qopy on Railway.app with different database options.

## 🚀 Quick Deploy (SQLite - Temporary Storage)

**Best for:** Testing, demos, temporary clips only

### One-Click Deploy
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/deploy)

### Manual Setup
1. Go to [Railway.app](https://railway.app)
2. Create new project from GitHub
3. Connect your Qopy repository
4. Railway will automatically detect and deploy

### What happens:
- ✅ Database automatically initializes on `/tmp/qopy.db`
- ✅ Health checks at `/api/health`
- ✅ Zero-downtime deployments
- ❌ **Clips are lost on redeploy** (ephemeral filesystem)

---

## 🗄️ Production Deploy (PostgreSQL - Persistent Storage)

**Best for:** Production use, persistent clips, user management

### Step 1: Add PostgreSQL Plugin
1. In your Railway project dashboard
2. Click "New" → "Database" → "PostgreSQL"
3. Railway will provide `DATABASE_URL` environment variable

### Step 2: Update Configuration
1. Rename `railway-postgres.toml` to `railway.toml`
2. Or manually set start command to: `node scripts/init-postgres.js && node server-postgres.js`

### Step 3: Environment Variables
Railway will automatically set:
- `DATABASE_URL` - PostgreSQL connection string
- `NODE_ENV=production`
- `RAILWAY_ENVIRONMENT=true`

### What happens:
- ✅ **Persistent storage** - clips survive redeploys
- ✅ **Production-ready** database
- ✅ **Scalable** for high traffic
- ✅ **Backup support** via Railway
- ✅ **User management** ready

---

## 🔧 Environment Variables

### Required for Production
```bash
ADMIN_TOKEN=your-secure-admin-token-here
```

### Optional
```bash
DOMAIN=your-custom-domain.com
ALLOWED_ORIGINS=https://app1.com,https://app2.com
RATE_LIMIT_MAX_REQUESTS=20
MAX_CONTENT_LENGTH=100000
```

### Railway Auto-Set
```bash
PORT=3000
NODE_ENV=production
RAILWAY_ENVIRONMENT=true
DATABASE_URL=postgresql://... (if using PostgreSQL)
```

---

## 📊 Monitoring

### Health Check
- **Endpoint**: `/api/health`
- **Timeout**: 30 seconds
- **Interval**: 10 seconds

### Admin Dashboard
- **URL**: `https://your-app.railway.app/api/admin/dashboard`
- **Auth**: Bearer token (ADMIN_TOKEN)

### Logs
- View in Railway dashboard
- Real-time log streaming
- Error tracking

---

## 🔄 Deployment Options

### Option 1: SQLite (Current)
```toml
# railway.toml
startCommand = "node scripts/railway-setup.js && node server-database.js"
```

**Pros:**
- Simple setup
- No additional services
- Fast deployment

**Cons:**
- No persistence
- Clips lost on redeploy
- Limited for production

### Option 2: PostgreSQL (Recommended for Production)
```toml
# railway.toml
startCommand = "node scripts/init-postgres.js && node server-postgres.js"
```

**Pros:**
- Full persistence
- Production ready
- Scalable
- Backup support

**Cons:**
- Requires PostgreSQL plugin
- Slightly more complex setup

---

## 🛠️ Troubleshooting

### Common Issues

**Build Fails:**
```bash
# Check npm version
npm run check-npm

# Clear cache
npm cache clean --force
```

**Database Connection Error:**
- Verify `DATABASE_URL` is set (PostgreSQL)
- Check Railway PostgreSQL plugin is active
- Ensure database is provisioned

**Health Check Fails:**
- Check application logs
- Verify `/api/health` endpoint responds
- Ensure all dependencies are installed

**Admin Dashboard Not Working:**
- Set `ADMIN_TOKEN` environment variable
- Check CORS configuration
- Verify authentication headers

### Debug Commands
```bash
# Check Railway environment
echo $RAILWAY_ENVIRONMENT

# Check database URL (PostgreSQL)
echo $DATABASE_URL

# Check admin token
echo $ADMIN_TOKEN
```

---

## 📈 Scaling

### Automatic Scaling
Railway automatically scales based on:
- CPU usage
- Memory usage
- Request volume

### Manual Scaling
1. Go to Railway dashboard
2. Select your service
3. Adjust CPU/Memory limits
4. Set minimum instances

### Performance Tips
- Use PostgreSQL for production
- Set appropriate rate limits
- Monitor memory usage
- Enable compression

---

## 🔒 Security

### Environment Variables
- Never commit secrets to Git
- Use Railway's environment variable system
- Rotate `ADMIN_TOKEN` regularly

### CORS Configuration
- Automatically configured for Railway domains
- Add custom domains via `DOMAIN` variable
- Additional origins via `ALLOWED_ORIGINS`

### Rate Limiting
- Default: 20 requests per 15 minutes
- Adjustable via `RATE_LIMIT_MAX_REQUESTS`
- IP-based blocking for abuse

---

## 📞 Support

### Railway Support
- [Railway Discord](https://discord.gg/railway)
- [Railway Documentation](https://docs.railway.app)
- [Railway Status](https://status.railway.app)

### Qopy Support
- GitHub Issues
- Admin Dashboard
- Health Check endpoint

---

## 🎯 Next Steps

1. **Choose deployment option** (SQLite vs PostgreSQL)
2. **Set up environment variables**
3. **Deploy to Railway**
4. **Configure custom domain** (optional)
5. **Set up monitoring** and alerts
6. **Scale as needed**

For production use, we strongly recommend using PostgreSQL for persistent storage and better scalability. 