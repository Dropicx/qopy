# Railway Health Check Debug Guide

## Problem
Railway health check is failing with "service unavailable" errors at `/api/health`.

## Quick Fixes Applied

### 1. Simplified Startup Script
- Removed complex conditional logic
- Made admin setup and spam downloads non-blocking
- Added fallback to direct `node server.js` start

### 2. Extended Health Check Timeouts
```dockerfile
HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=5
```
- **start-period**: 60s (gives more time for initial startup)
- **retries**: 5 (more attempts before declaring failure)
- **timeout**: 15s (longer timeout per check)

### 3. Robust CMD with Fallback
```dockerfile
CMD ["/bin/sh", "-c", "if [ -x /app/startup.sh ]; then /app/startup.sh; else echo 'Startup script failed, starting directly...'; node server.js; fi"]
```

## Railway Environment Variables for Debugging

Set these in Railway to help diagnose issues:

```bash
# Enable debug mode
DEBUG=true

# Basic required variables
NODE_ENV=production
PORT=3000

# Optional admin token (will be generated if not set)
ADMIN_TOKEN=your-secure-token-here

# Spam filtering (optional)
SPAM_FILTER_ENABLED=true
SPAM_SCORE_THRESHOLD=50
```

## Debugging Steps

### 1. Check Railway Logs
Look for these startup messages:
```
🚀 Starting Qopy...
User: qopy
Working Directory: /app
Node Version: v20.x.x
✅ Server file found
🚀 Starting server...
🚀 Qopy Server successfully started
```

### 2. Manual Health Check
After deployment, test manually:
```bash
curl https://your-app.railway.app/api/health
```

Expected response:
```json
{
  "status": "OK",
  "uptime": 123.45,
  "activeClips": 0,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "spamFilter": { ... },
  "ipBlacklist": { ... }
}
```

### 3. Common Issues & Solutions

#### Issue: "EADDRINUSE" (Port already in use)
- **Solution**: Railway should handle this automatically
- **Check**: Ensure no hardcoded ports in code

#### Issue: NPM script failures
- **Solution**: Startup now uses direct `node server.js`
- **Fallback**: Skip optional setup steps

#### Issue: Permission errors
- **Solution**: Applied in Dockerfile with proper ownership
- **Verification**: `chown -R qopy:nodejs /app`

#### Issue: Missing dependencies
- **Check**: `npm ci --only=production` in build
- **Verify**: `node_modules` directory exists

## Emergency Bypass

If health checks continue to fail, you can:

### 1. Set Manual Environment Variables
Add to Railway environment:
```bash
ADMIN_TOKEN=your-token-here
SPAM_FILTER_ENABLED=false
```

### 2. Disable Optional Features
The server will start with minimal features if setup scripts fail.

### 3. Direct Node Start
Startup script now has built-in fallback to `node server.js`.

## Monitoring Commands

After successful deployment:

```bash
# Check health
curl https://your-app.railway.app/api/health

# Check admin access (if token is set)
curl -H "Authorization: Bearer your-token" https://your-app.railway.app/api/admin/stats

# Test basic functionality
curl -X POST https://your-app.railway.app/api/clip \
  -H "Content-Type: application/json" \
  -d '{"content":"test"}'
```

## Startup Sequence

1. **Container starts** → `/app/startup.sh` executes
2. **Basic checks** → Verify server.js exists
3. **Optional setup** → Admin dashboard (non-blocking)
4. **Optional setup** → Spam lists (non-blocking)
5. **Server start** → `node server.js` (direct execution)
6. **Health check** → Railway pings `/api/health`

## Success Indicators

✅ Railway logs show "Server successfully started"
✅ Health check returns HTTP 200
✅ Admin dashboard accessible (if token set)
✅ API endpoints respond correctly

---
Generated: ${new Date().toISOString()} 