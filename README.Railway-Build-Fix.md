# Railway Build Permission Fix

## Problem
Railway build was failing with permission errors when trying to write `.env.example` file:
```
❌ Setup failed: EACCES: permission denied, open '/app/.env.example'
```

## Root Cause
The issue occurred because:
- Docker user `qopy` had insufficient permissions to write files during build
- Admin setup scripts were running during build phase instead of runtime
- File ownership and directory permissions were not properly set

## Solution Implemented

### 1. Fixed Directory Permissions
Updated Dockerfile to ensure proper permissions:
```dockerfile
# Ensure qopy user owns the entire app directory and can write
RUN chown -R qopy:nodejs /app && \
    chmod -R 755 /app && \
    chmod -R 775 data logs
```

### 2. Moved Setup to Runtime
- Removed admin setup from build phase (Dockerfile and railway.toml)
- Added admin setup to startup script to run at container startup
- This avoids permission issues during build

### 3. Enhanced Error Handling
- Added try-catch blocks in `scripts/setup-admin.js`
- Graceful fallback if files cannot be written
- Outputs configuration to console if file write fails

### 4. Updated Build Process

**railway.toml changes:**
```toml
[build]
buildCommand = "node scripts/check-npm-version.js && npm ci --only=production"
# Removed: npm run setup-admin (moved to runtime)
```

**Dockerfile changes:**
- Removed `RUN npm run setup-admin` from build phase
- Added admin setup to startup script
- Enhanced permission management

## Files Modified
- `Dockerfile` - Fixed permissions and moved setup to runtime
- `railway.toml` - Removed setup-admin from build command
- `scripts/setup-admin.js` - Added error handling for file writes
- `README.Railway-Build-Fix.md` - This documentation

## Runtime Flow
1. Container starts with proper permissions
2. Startup script checks for admin configuration
3. If missing, runs admin setup at runtime
4. Downloads spam lists if needed
5. Starts the application

## Benefits
- ✅ No more permission errors during Railway builds
- ✅ Admin setup runs reliably at runtime
- ✅ Graceful handling of file write failures
- ✅ Better error reporting and diagnostics
- ✅ Maintains security with non-root user

## Verification
After deployment:
1. Check Railway logs for successful startup
2. Visit `/admin` endpoint to verify admin dashboard
3. Look for admin token in startup logs
4. Verify ADMIN-QUICKSTART.md is created

## Rollback
If issues occur, you can:
1. Set `ADMIN_TOKEN` manually in Railway environment variables
2. Skip admin setup by creating an empty `ADMIN-QUICKSTART.md` file
3. Use manual IP management via API endpoints

---
Generated: ${new Date().toISOString()} 