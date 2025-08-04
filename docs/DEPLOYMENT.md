# Qopy Deployment Guide

## Overview

This comprehensive deployment guide consolidates all deployment information for Qopy, including Railway.app specific instructions, pre-deployment checklists, and environment setup.

## Pre-Deployment Checklist

### Code Review - Critical Issues Resolved

#### Fixed Issues:
1. **PostgreSQL Schema Syntax**
   - Problem: INDEX syntax in CREATE TABLE (PostgreSQL-incompatible)
   - Fix: Created separate CREATE INDEX statements
   - Status: ✅ RESOLVED

2. **File Stream Handling**
   - Problem: `await fs.createWriteStream()` - createWriteStream is not async
   - Fix: Added Promise wrapper for writeStream.end()
   - Status: ✅ RESOLVED

3. **XSS Vulnerability**
   - Problem: `data.filename` directly in innerHTML without escaping
   - Fix: Secure `textContent` for filename display
   - Status: ✅ RESOLVED

4. **Race Condition in Database**
   - Problem: Inconsistent order in DELETE FROM with Foreign Keys
   - Fix: Correct order `file_chunks` before `upload_sessions`
   - Status: ✅ RESOLVED

5. **Memory Leak**
   - Problem: `currentUploadSession` not cleared in `cancelUpload`
   - Fix: Extended cleanup to include session data
   - Status: ✅ RESOLVED

6. **Input Validation**
   - Problem: Missing password validation in file upload
   - Fix: Added password length and empty validation
   - Status: ✅ RESOLVED

### Dependencies Check
- [ ] Node.js >= 18.0.0
- [ ] npm >= 10.0.0
- [ ] `npm install` successful
- [ ] All dependencies in package.json present

### Local Testing
- [ ] `npm start` runs without errors
- [ ] `npm test` passes all tests
- [ ] `npm run lint` shows no errors
- [ ] `npm run typecheck` passes

## Railway.app Deployment

### Overview
Railway.app provides a modern platform for deploying Node.js applications with integrated PostgreSQL, Redis, and persistent storage.

### Required Services

#### 1. PostgreSQL Database
```
Plugin: PostgreSQL
- Automatic provisioning
- DATABASE_URL automatically set
- Minimum version: 13.0
```

#### 2. Redis Service (Optional but Recommended)
```
Plugin: Redis
- Automatic provisioning
- REDIS_URL automatically set
- Used for upload session caching
- Fallback to memory cache if unavailable
```

#### 3. Volume Storage (Required)
```
Service: Volume
- Mount Path: /app/uploads
- Size: Minimum 10GB (recommended: 50GB+)
- Used for persistent file storage
```

### Step-by-Step Deployment

#### Step 1: Repository Preparation
```bash
# Clone/fork repository
git clone [repository-url]
cd qopy

# Install dependencies locally
npm install

# Run tests
npm test

# Verify build
npm run build
```

#### Step 2: Railway.app Project Setup

1. **Create New Project**
   - Sign in to Railway.app
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Connect your GitHub account
   - Select the Qopy repository

2. **Add PostgreSQL Plugin**
   ```
   Dashboard → Add Plugin → PostgreSQL
   ```
   - Railway automatically provisions PostgreSQL
   - `DATABASE_URL` is automatically set

3. **Add Redis Plugin (Recommended)**
   ```
   Dashboard → Add Plugin → Redis
   ```
   - Railway automatically provisions Redis
   - `REDIS_URL` is automatically set

4. **Create Volume for File Storage**
   ```
   Dashboard → Add Volume
   ```
   Configuration:
   - Name: `qopy-files`
   - Mount Path: `/app/uploads`
   - Size: `50GB` (adjust based on needs)

5. **Important: Note the Volume Mount Path**
   After creating the volume, Railway will show the actual mount path:
   ```
   /var/lib/containers/railwayapp/bind-mounts/[VOLUME_ID]
   ```
   Copy this path - you'll need it for environment variables.

#### Step 3: Environment Variables

Set the following environment variables in Railway Dashboard → Variables:

```bash
# Automatic (set by Railway)
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
PORT=8080

# Manual (must set these)
RAILWAY_VOLUME_MOUNT_PATH=/var/lib/containers/railwayapp/bind-mounts/[VOLUME_ID]
RAILWAY_RUN_UID=0                # Important for mkdir permissions
NODE_ENV=production

# Optional (for enhanced features)
MAX_FILE_SIZE=104857600          # 100MB in bytes
CHUNK_SIZE=5242880               # 5MB in bytes
SESSION_TIMEOUT=3600000          # 1 hour in milliseconds
```

#### Step 4: Deploy Application

1. **Initial Deployment**
   - Push code to GitHub
   - Railway automatically deploys on push
   - Monitor deployment logs in Railway Dashboard

2. **Database Migration (Automatic)**
   The application automatically runs migrations on startup:
   ```javascript
   // Migration runs automatically when server starts
   // Look for these log messages:
   "Database connected successfully"
   "Multi-part upload database migration completed successfully!"
   ```

3. **Manual Migration (if needed)**
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli

   # Connect to Railway
   railway login
   railway link [project-id]

   # Execute migration manually
   railway run psql $DATABASE_URL -f scripts/database-migration.sql
   ```

#### Step 5: Verify Deployment

1. **Check Application Health**
   - Visit your Railway app URL
   - Should see the Qopy homepage
   - Test file upload functionality

2. **Monitor Logs**
   ```bash
   railway logs
   ```
   Look for:
   - "Server started successfully"
   - "Database connected"
   - "Redis connected" (if using Redis)
   - "Storage directories created"

3. **Test Features**
   - [ ] File upload (single file)
   - [ ] Multi-part upload (large files)
   - [ ] Quick Share functionality
   - [ ] Encrypted uploads
   - [ ] File download
   - [ ] Link expiration

### Troubleshooting

#### Common Issues

1. **Volume Not Accessible**
   - Symptom: "ENOENT: no such file or directory"
   - Solution: Verify RAILWAY_VOLUME_MOUNT_PATH is set correctly
   - Check: Volume is attached in Railway Dashboard

2. **Database Connection Failed**
   - Symptom: "Connection refused" errors
   - Solution: Ensure PostgreSQL plugin is provisioned
   - Check: DATABASE_URL is set in environment variables

3. **Permission Errors**
   - Symptom: "EACCES: permission denied"
   - Solution: Set RAILWAY_RUN_UID=0 in environment variables
   - Note: Railway requires this for file operations

4. **Memory Issues**
   - Symptom: "JavaScript heap out of memory"
   - Solution: Upgrade Railway plan for more memory
   - Alternative: Reduce CHUNK_SIZE in environment variables

#### Debug Commands
```bash
# View logs
railway logs --tail 100

# Connect to database
railway run psql $DATABASE_URL

# Check environment variables
railway run env

# SSH into container (if available on plan)
railway shell
```

## Alternative Deployment Platforms

### Heroku
```bash
# Prerequisites
- Heroku CLI installed
- PostgreSQL add-on
- Redis add-on
- Persistent disk add-on

# Deploy
heroku create qopy-app
heroku addons:create heroku-postgresql:hobby-dev
heroku addons:create heroku-redis:hobby-dev
git push heroku main
```

### Docker
```bash
# Build image
docker build -t qopy .

# Run with docker-compose
docker-compose up -d
```

### Manual VPS Deployment
1. Install Node.js 18+
2. Install PostgreSQL 13+
3. Install Redis (optional)
4. Clone repository
5. Set environment variables
6. Run with PM2 or systemd

## Security Considerations

### Production Security Checklist
- [ ] HTTPS enabled (Railway provides automatically)
- [ ] Environment variables secured
- [ ] Database credentials not in code
- [ ] File upload size limits enforced
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] XSS protection enabled
- [ ] SQL injection prevention verified
- [ ] Path traversal protection active

### Recommended Security Headers
```javascript
// Already implemented in server.js via helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
```

## Performance Optimization

### Railway.app Optimizations
1. **Enable Redis** for session caching
2. **Scale Dynos** for high traffic
3. **Configure CDN** for static assets
4. **Monitor Performance** via Railway metrics

### Application Optimizations
1. **Database Indexes** - Already created via migration
2. **File Compression** - Sharp library for images
3. **Chunk Processing** - Optimized for 5MB chunks
4. **Connection Pooling** - PostgreSQL pool configured

## Monitoring and Maintenance

### Health Checks
- Endpoint: `/health` (returns 200 OK)
- Database connectivity check
- Storage availability check
- Memory usage monitoring

### Backup Strategy
1. **Database Backups**
   - Railway provides automatic daily backups
   - Manual backups via `pg_dump`

2. **File Storage Backups**
   - Volume snapshots (if available)
   - External backup service integration

### Scaling Considerations
1. **Horizontal Scaling**
   - Multiple Railway instances
   - Load balancer configuration
   - Shared Redis for sessions

2. **Vertical Scaling**
   - Upgrade Railway plan
   - Increase memory/CPU allocation
   - Optimize chunk sizes

## Post-Deployment Tasks

### Immediate Tasks
- [ ] Verify all endpoints working
- [ ] Test file upload/download
- [ ] Check error logging
- [ ] Monitor initial performance

### Within 24 Hours
- [ ] Set up monitoring alerts
- [ ] Configure backup automation
- [ ] Review security headers
- [ ] Test disaster recovery

### Weekly Maintenance
- [ ] Review error logs
- [ ] Check disk usage
- [ ] Monitor performance metrics
- [ ] Update dependencies

## Support and Resources

### Railway.app Resources
- [Railway Documentation](https://docs.railway.app)
- [Railway Discord](https://discord.gg/railway)
- [Railway Status](https://status.railway.app)

### Qopy Resources
- GitHub Issues for bug reports
- Documentation in `/docs` directory
- Test suite for validation

### Emergency Contacts
- Railway Support: support@railway.app
- Application Issues: Create GitHub issue

## Conclusion

This deployment guide provides comprehensive instructions for deploying Qopy on Railway.app. Following these steps ensures a secure, scalable, and maintainable deployment. Regular monitoring and maintenance keep the application running smoothly in production.