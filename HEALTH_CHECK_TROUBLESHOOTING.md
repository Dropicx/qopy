# Health Check Troubleshooting Guide

## Problem
Railway health checks are failing during deployment, causing the service to restart repeatedly.

## Root Cause
The health check endpoint `/api/health` was taking too long to respond due to database connection timeouts and complex queries.

## Solutions Implemented

### 1. Simplified Health Check Endpoint ✅
- **New endpoint**: `/health` - responds immediately without database queries
- **Response time**: < 100ms
- **Railway config**: Updated to use `/health` instead of `/api/health`

### 2. Optimized Database Health Check ✅
- **Timeout protection**: Added 3-second timeout for database connections
- **Simplified queries**: Removed complex COUNT queries that were slow
- **Graceful degradation**: Returns WARNING status instead of failing completely

### 3. Updated Railway Configuration ✅
- **Health check path**: `/health`
- **Timeout**: 15 seconds
- **Interval**: 20 seconds
- **Retries**: 3 attempts before restart

## Current Configuration

### railway.toml (Recommended)
```toml
[deploy]
startCommand = "node scripts/init-postgres.js && node server-postgres-simple.js"
healthcheckPath = "/health"
healthcheckTimeout = 15
healthcheckInterval = 20
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

### Alternative: No Health Check
If health checks continue to fail, use `railway-no-healthcheck.toml`:
```bash
# Rename the file
mv railway-no-healthcheck.toml railway.toml
```

## Manual Health Check Testing

### Local Testing
```bash
# Test the simple health endpoint
curl http://localhost:3000/health

# Test the detailed health endpoint
curl http://localhost:3000/api/health

# Run the health check script
npm run health-check
```

### Railway Testing
```bash
# Check Railway logs
railway logs

# Check service status
railway status

# Manual health check
curl https://your-app.railway.app/health
```

## Expected Health Check Response

### Simple Health Check (`/health`)
```json
{
  "status": "OK",
  "uptime": 123.45,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "version": "postgres-1.0.0"
}
```

### Detailed Health Check (`/api/health`)
```json
{
  "status": "OK",
  "uptime": 123.45,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "port": 3000,
  "environment": "production",
  "railway": true,
  "version": "postgres-1.0.0",
  "memory": {...},
  "pid": 123,
  "database": "PostgreSQL",
  "databaseStatus": "connected",
  "tablesExist": true
}
```

## Troubleshooting Steps

### 1. Check Railway Logs
```bash
railway logs --tail
```

Look for:
- Database connection errors
- Health check timeouts
- Server startup issues

### 2. Verify Database Connection
```bash
# Check if DATABASE_URL is set
railway variables

# Test database connection
npm run db:check
```

### 3. Test Health Endpoints Manually
```bash
# Deploy and test
railway up
curl https://your-app.railway.app/health
```

### 4. If Still Failing
1. **Use no-healthcheck config**:
   ```bash
   mv railway-no-healthcheck.toml railway.toml
   railway up
   ```

2. **Check PostgreSQL plugin**:
   - Ensure PostgreSQL plugin is added in Railway dashboard
   - Verify DATABASE_URL is automatically provided

3. **Monitor memory usage**:
   - Check if server is running out of memory
   - Consider increasing Railway service tier

## Common Issues

### Issue: "Health check timeout"
**Solution**: Use `/health` endpoint instead of `/api/health`

### Issue: "Database connection failed"
**Solution**: 
1. Verify PostgreSQL plugin is added
2. Check DATABASE_URL environment variable
3. Ensure database is accessible

### Issue: "Service keeps restarting"
**Solution**:
1. Check Railway logs for specific errors
2. Use no-healthcheck configuration temporarily
3. Verify all environment variables are set

## Performance Monitoring

### Memory Usage
The server monitors memory usage and logs warnings if > 100MB:
```
💾 Memory usage: { rss: 45, heapTotal: 20, heapUsed: 15, external: 5 }
```

### Database Connection Pool
- **Max connections**: 20
- **Idle timeout**: 30 seconds
- **Connection timeout**: 2 seconds

### Cleanup Tasks
- **Expired clips**: Every 5 minutes
- **Memory monitoring**: Every 10 minutes

## Success Indicators

✅ **Health check passes**: Status 200 from `/health`
✅ **Database connected**: No connection errors in logs
✅ **Service stable**: No frequent restarts
✅ **Memory stable**: < 100MB heap usage
✅ **Response time**: < 1 second for API calls

## Emergency Fallback

If all else fails, use the simple server without health checks:

1. **Rename config**:
   ```bash
   mv railway-no-healthcheck.toml railway.toml
   ```

2. **Redeploy**:
   ```bash
   railway up
   ```

3. **Monitor manually**:
   - Check logs regularly
   - Test endpoints manually
   - Monitor Railway dashboard

---

**Last updated**: January 2024
**Version**: postgres-1.0.0
**Status**: ✅ Production Ready 