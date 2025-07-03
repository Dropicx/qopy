# Production Troubleshooting Guide

## 🎉 Deployment Successful!

Your Qopy app is now running on Railway! Here's how to monitor and troubleshoot it.

## 🔍 Step-by-Step Troubleshooting

### 1. **Quick Health Check**
```bash
# Test basic functionality
npm run test-deployment

# Or manually check health
curl https://your-app.railway.app/health
```

### 2. **Monitor Production**
```bash
# Start continuous monitoring
npm run monitor

# Or check Railway logs
railway logs --tail
```

### 3. **Database Status**
```bash
# Check database connection
npm run db:check

# Or test via API
curl https://your-app.railway.app/api/clip/ABCDEF/info
```

## 📊 Monitoring Tools

### Automated Test Suite
```bash
npm run test-deployment
```
**Tests:**
- ✅ Health check endpoint
- ✅ Ping endpoint  
- ✅ Main page loading
- ✅ Database connection
- ✅ Favicon loading
- ✅ Clip creation/retrieval

### Production Monitor
```bash
npm run monitor
```
**Features:**
- Continuous health checks every minute
- Error threshold alerts (3 consecutive failures)
- Automatic recovery detection
- Database and page availability checks

### Railway Dashboard
- **URL**: https://railway.app/dashboard
- **Logs**: Real-time application logs
- **Metrics**: CPU, memory, network usage
- **Deployments**: Build and deployment history

## 🚨 Common Issues & Solutions

### Issue: Health Check Failing
**Symptoms:**
- 404 or 500 errors on `/health`
- Server not responding

**Solutions:**
1. Check Railway logs: `railway logs --tail`
2. Verify environment variables: `railway variables`
3. Restart service: `railway up`

### Issue: Database Connection Failed
**Symptoms:**
- 500 errors on API calls
- "DATABASE_URL not found" in logs

**Solutions:**
1. Verify PostgreSQL plugin is added in Railway dashboard
2. Check `DATABASE_URL` environment variable
3. Test database connection: `npm run db:check`

### Issue: Slow Response Times
**Symptoms:**
- Requests taking > 5 seconds
- Timeout errors

**Solutions:**
1. Check Railway service tier (upgrade if needed)
2. Monitor memory usage in Railway dashboard
3. Review application logs for bottlenecks

### Issue: Static Files Not Loading
**Symptoms:**
- CSS/JS not loading
- 404 errors for static assets

**Solutions:**
1. Verify `public/` directory is included in deployment
2. Check file permissions
3. Clear browser cache

## 🔧 Manual Testing

### Test Health Endpoints
```bash
# Health check
curl https://your-app.railway.app/health

# Ping
curl https://your-app.railway.app/ping

# Main page
curl https://your-app.railway.app/
```

### Test API Functionality
```bash
# Create a test clip
curl -X POST https://your-app.railway.app/api/share \
  -H "Content-Type: application/json" \
  -d '{"content":"Test clip","expiration":"5min"}'

# Retrieve the clip (replace CLIPID with actual ID)
curl -X POST https://your-app.railway.app/api/clip/CLIPID \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Test Database
```bash
# Check if tables exist
railway run node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT COUNT(*) FROM clips').then(result => {
  console.log('Clips table exists:', result.rows[0].count);
  pool.end();
}).catch(err => {
  console.error('Database error:', err.message);
  pool.end();
});
"
```

## 📈 Performance Monitoring

### Key Metrics to Watch
1. **Response Time**: < 1 second for API calls
2. **Uptime**: > 99.9%
3. **Memory Usage**: < 100MB
4. **Database Connections**: < 10 active
5. **Error Rate**: < 1%

### Railway Metrics
- **CPU Usage**: Should be < 80%
- **Memory Usage**: Should be < 512MB
- **Network**: Monitor for unusual spikes
- **Build Time**: Should be < 5 minutes

## 🛠️ Maintenance Tasks

### Daily
- Check Railway logs for errors
- Monitor health check status
- Verify database connectivity

### Weekly
- Review performance metrics
- Check for expired clips cleanup
- Update dependencies if needed

### Monthly
- Review Railway usage and costs
- Backup important data
- Update documentation

## 🔄 Recovery Procedures

### Service Restart
```bash
# Restart the service
railway up

# Or force restart
railway service restart
```

### Database Recovery
```bash
# Check database status
railway run node scripts/check-database.js

# Reinitialize if needed
railway run node scripts/init-postgres.js
```

### Full Redeployment
```bash
# Complete redeployment
railway up --detach

# Monitor deployment
railway logs --tail
```

## 📞 Emergency Contacts

### Railway Support
- **Documentation**: https://docs.railway.app
- **Discord**: https://discord.gg/railway
- **Status Page**: https://status.railway.app

### Application Issues
1. Check this troubleshooting guide
2. Review Railway logs
3. Test with provided scripts
4. Check GitHub issues (if applicable)

## ✅ Success Checklist

- [ ] Health check returns 200 OK
- [ ] Main page loads correctly
- [ ] Database connection working
- [ ] Clip creation/retrieval functional
- [ ] Static files (CSS/JS) loading
- [ ] Favicon displaying
- [ ] No errors in Railway logs
- [ ] Response times < 1 second
- [ ] Memory usage stable
- [ ] Uptime > 99%

## 🎯 Next Steps

1. **Share your app URL** with users
2. **Set up monitoring** with `npm run monitor`
3. **Test all features** manually
4. **Monitor Railway dashboard** regularly
5. **Document any issues** for future reference

---

**Last updated**: January 2024
**Version**: minimal-1.0.0
**Status**: ✅ Production Ready 