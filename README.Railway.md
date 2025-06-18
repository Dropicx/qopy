# Qopy - Railway Deployment Guide

This guide explains how to deploy Qopy on Railway.app - a modern Platform-as-a-Service (PaaS).

## 🚀 Quick Deploy to Railway

### Option 1: Deploy from GitHub (Recommended)

1. **Fork or Clone this Repository**
   ```bash
   git clone <your-repo-url>
   cd qopy
   ```

2. **Create a New Project on Railway**
   - Go to [Railway.app](https://railway.app)
   - Click "Deploy from GitHub repo"
   - Select your Qopy repository
   - Railway will automatically detect it's a Node.js app

3. **Railway will automatically:**
   - Install dependencies (`npm install`)
   - Start the application (`npm start`)
   - Assign a domain (e.g., `qopy-production.up.railway.app`)

### Option 2: Deploy with Railway CLI

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login and Initialize**
   ```bash
   railway login
   railway init
   ```

3. **Deploy**
   ```bash
   railway up
   ```

4. **Generate Domain**
   ```bash
   railway domain
   ```

## 🔧 Configuration

### Environment Variables

Railway automatically provides:
- `PORT` - The port your app should listen on
- `NODE_ENV=production` - Set automatically

Optional variables you can set in Railway dashboard:
- `DOMAIN` - Your custom domain (e.g., `qopy.io`)
- `RATE_LIMIT_WINDOW_MS` - Rate limiting window (default: 900000ms = 15min)
- `RATE_LIMIT_MAX_REQUESTS` - Max requests per window (default: 20)
- `MAX_CONTENT_LENGTH` - Maximum content length in characters (default: 100000)

### Health Checks

The app includes a health check endpoint at `/api/health` that Railway uses for:
- Deployment verification
- Automatic restarts on failure
- Service monitoring

## 🌐 Custom Domain Setup

### For qopy.io domain:

1. **In Railway Dashboard:**
   - Go to your service
   - Navigate to "Networking" → "Custom Domain"
   - Add `qopy.io` and `www.qopy.io`

2. **DNS Configuration:**
   ```
   Type: CNAME
   Name: qopy.io (or www)
   Value: <provided-railway-domain>
   ```

3. **Environment Variable:**
   - Set `DOMAIN=qopy.io` in Railway dashboard
   - This ensures QR codes and share URLs use your custom domain

## 📊 Monitoring & Scaling

### Built-in Railway Features:
- **Metrics Dashboard** - CPU, Memory, Network usage
- **Logs** - Real-time application logs
- **Auto-scaling** - Horizontal scaling based on traffic
- **Health monitoring** - Automatic restart on failures

### Performance Optimizations:
- **Memory**: Railway automatically optimizes memory usage
- **CDN**: Railway provides global CDN for static files
- **Compression**: Already enabled in the app via middleware

## 🔒 Security Best Practices

### Railway automatically provides:
- HTTPS/TLS certificates
- DDoS protection
- Regular security updates

### App-level security features:
- Rate limiting (Express Rate Limit)
- Security headers (Helmet.js)
- Input validation (Express Validator)
- CORS configuration
- XSS protection

## 🚦 Deployment Pipeline

### Automatic Deployments:
1. Push to main branch
2. Railway detects changes
3. Builds and deploys automatically
4. Health check verification
5. Traffic routing to new version

### Zero-downtime deployments are automatic!

## 🛠 Troubleshooting

### Common Issues:

**Build Failures:**
```bash
# Check Railway logs
railway logs

# Local debugging
npm install
npm start
```

**Port Issues:**
- Railway automatically sets `PORT` environment variable
- Ensure your app uses `process.env.PORT`

**Memory Issues:**
- Railway auto-scales, but you can adjust resource allocation
- Default memory limit is sufficient for most use cases

**Domain Issues:**
- Verify DNS propagation (can take up to 48 hours)
- Check Railway dashboard for domain status

## 📈 Scaling

Railway automatically handles:
- **Vertical scaling** - More CPU/Memory as needed
- **Horizontal scaling** - Multiple instances during high traffic
- **Geographic distribution** - Deploys closer to users

## 💰 Cost Optimization

- Railway has a generous free tier
- Pay-as-you-scale pricing
- Automatic sleep for low-traffic apps
- No fixed monthly costs for small projects

## 🔄 Environment Management

Railway supports multiple environments:
- **Production** - Your live app
- **Development** - Testing environment
- **Staging** - Pre-production testing

Each environment can have different:
- Environment variables
- Custom domains
- Resource allocations

---

## Next Steps

After deployment:
1. ✅ Verify health check at `https://your-domain.railway.app/api/health`
2. ✅ Test sharing functionality
3. ✅ Set up custom domain (qopy.io)
4. ✅ Configure monitoring alerts
5. ✅ Set up automated backups (if using database in future)

For support: [Railway Discord](https://discord.gg/railway) or [Railway Docs](https://docs.railway.app) 