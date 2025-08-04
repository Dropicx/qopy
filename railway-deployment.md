# Qopy Deployment on Railway.app

## Multi-Part Upload & File-Sharing Deployment Guide

### Overview
This guide describes the deployment of the extended Qopy version with multi-part upload and file-sharing functionality on Railway.app.

### Required Services

#### 1. PostgreSQL Database
```
Plugin: PostgreSQL
- Automatic provisioning
- DATABASE_URL automatically set
- Execute database-migration.sql script
```

#### 2. Redis Service (for Upload Session Caching)
```
Plugin: Redis
- Automatic provisioning
- REDIS_URL automatically set
- Optional but recommended for performance
```

#### 3. Volume Storage (for File Uploads)
```
Service: Volume
- Mount Path: /app/uploads
- Size: Minimum 10GB (recommended: 50GB+)
- Environment Variable: RAILWAY_VOLUME_MOUNT_PATH=/app/uploads
```

### Deployment Steps

#### Step 1: Repository Preparation
```bash
# 1. Clone/fork repository
git clone [repository-url]
cd qopy

# 2. Install dependencies (test locally)
npm install

# 3. New files added:
# - scripts/database-migration.sql
# - public/file-upload.js
# - Extended server.js with upload APIs
# - Extended index.html with file upload UI
# - Extended styles.css with file upload styles
```

#### Step 2: Railway.app Setup
1. **Create new project**
   - Connect GitHub repository
   - Railway automatically detects Node.js

2. **Add PostgreSQL plugin**
   ```
   Dashboard → Add Plugin → PostgreSQL
   ```

3. **Add Redis plugin**
   ```
   Dashboard → Add Plugin → Redis
   ```

4. **Create volume**
   ```
   Dashboard → Add Volume
   - Name: qopy-files
   - Mount Path: /app/uploads
   - Size: 50GB
   ```

5. **Set environment variables**
   ```
   DATABASE_URL=postgresql://... (automatically set)
   REDIS_URL=redis://... (automatically set)
   RAILWAY_VOLUME_MOUNT_PATH=/app/uploads
   NODE_ENV=production
   PORT=8080 (automatically set)
   ```

#### Step 3: Database Migration
After first deployment:

```bash
# Install Railway CLI (if not present)
npm install -g @railway/cli

# Connect to Railway
railway login
railway link [project-id]

# Execute database migration
railway run psql $DATABASE_URL -f scripts/database-migration.sql
```

Or via Railway Dashboard:
1. PostgreSQL Service → Connect → Query
2. Copy and execute contents of `scripts/database-migration.sql`

### Features After Deployment

#### Text-Sharing (extended)
- **Unchanged UI**: Existing text-sharing functionality remains identical
- **New Backend Architecture**: Now uses multi-part system for consistency
- **Larger Content**: Content >1MB automatically saved as files
- **Better Performance**: Redis caching for session management

#### File-Sharing (new)
- **Multi-Part Upload**: Chunks up to 5MB for robust uploads
- **File Size**: Up to 100MB per file
- **All File Types**: Supports all MIME types
- **Progress Tracking**: Real-time upload progress
- **Drag & Drop**: Modern upload UI
- **Download Management**: Streaming downloads with progress

#### Upload Management
- **Upload Sessions**: Persistent upload management
- **Chunk Validation**: SHA256 checksums for integrity
- **Error Recovery**: Automatic retry for failed chunks
- **Cleanup**: Automatic cleanup of expired uploads

### Monitoring & Maintenance

#### Monitor Logs
```bash
# Deployment logs
railway logs

# Database logs
railway logs --service postgresql

# Redis logs  
railway logs --service redis
```

#### Storage Monitoring
```bash
# Check volume usage
railway shell
df -h /app/uploads
```

#### Database Maintenance
```sql
-- Upload statistics
SELECT 
    date,
    total_uploads,
    completed_uploads,
    failed_uploads,
    total_file_size / (1024*1024) as total_mb
FROM upload_statistics 
ORDER BY date DESC LIMIT 30;

-- Active upload sessions
SELECT 
    upload_id,
    filename,
    status,
    uploaded_chunks,
    total_chunks,
    (uploaded_chunks::float / total_chunks * 100)::int as progress_percent
FROM upload_sessions 
WHERE status = 'uploading';

-- Storage usage
SELECT 
    content_type,
    COUNT(*) as count,
    SUM(filesize) / (1024*1024) as total_mb
FROM clips 
WHERE created_at > extract(epoch from now() - interval '30 days') * 1000
GROUP BY content_type;
```

### Performance Optimizations

#### Redis Configuration
```
maxmemory-policy: allkeys-lru
maxmemory: 256mb
```

#### PostgreSQL Tuning
```sql
-- Connection pooling (already implemented)
max_connections = 100

-- Index optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clips_created_at_desc ON clips(created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_upload_sessions_last_activity ON upload_sessions(last_activity);
```

#### File System Optimization
- Volume automatically optimized by Railway.app
- SSD-based storage for best performance
- Automatic backups by Railway

### Security Features

#### Rate Limiting
- **Upload Limits**: 10 upload sessions per IP/15min
- **File Size Limits**: 100MB per file
- **Chunk Validation**: SHA256 integrity
- **Malware Protection**: Through MIME type validation

#### Privacy & Compliance
- **Zero-Knowledge**: Server sees no unencrypted content
- **Auto-Expiration**: Automatic deletion after expiry
- **IP Anonymization**: No persistent IP storage
- **GDPR Compliant**: Privacy-by-design architecture

### Cost Estimation (Railway.app)

#### Base Setup
```
App Instance:     $5-20/month (depending on CPU/RAM)
PostgreSQL:       $5/month (Starter)
Redis:            $3/month (Starter)
Volume (50GB):    $5/month
Total:            ~$18-33/month
```

#### Scaling Options
```
App Instances:    Horizontal scaling possible
Database:         Vertical scaling on Railway Pro
Redis:            Cluster mode for high availability
Volume:           Up to 100GB+ possible
```

### Troubleshooting

#### Upload Issues
```javascript
// Client-side debug logs
console.log('Upload Debug Info:');
console.log('File size:', file.size);
console.log('Chunk size:', CHUNK_SIZE);
console.log('Total chunks:', Math.ceil(file.size / CHUNK_SIZE));
```

#### Storage Issues
```bash
# Check volume space
railway shell
du -sh /app/uploads/*

# Manually trigger cleanup
curl -X POST https://your-app.railway.app/api/admin/cleanup
```

#### Database Performance
```sql
-- Slow query analysis
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY total_time DESC LIMIT 10;
```

### Migration from Existing Qopy Installation

#### Data Migration
```sql
-- Backup existing data
pg_dump $OLD_DATABASE_URL > qopy_backup.sql

-- Import to new database
psql $NEW_DATABASE_URL < qopy_backup.sql

-- Apply schema update
psql $NEW_DATABASE_URL -f scripts/database-migration.sql
```

#### Zero-Downtime Deployment
1. Deploy new Railway app in parallel
2. Prepare domain switch
3. Create final backup
4. Switch DNS to new app
5. Deactivate old app after 24h

### Support & Maintenance

#### Automatic Backups
Railway.app automatically creates:
- **Database Backups**: Daily
- **Volume Snapshots**: On demand
- **Application Rollbacks**: Git-based

#### Monitoring
```javascript
// Health check endpoints
GET /health          // Basic health
GET /api/health      // API health with DB test
GET /ping           // Simple ping
```

#### Updates
```bash
# Code updates
git pull origin main
git push railway main

# Database schema updates
railway run psql $DATABASE_URL -f new-migration.sql
```

---

**After successful deployment, you have a complete multi-part upload & file-sharing platform with:**

- **Text Sharing** (extended & optimized)
- **File Upload** up to 100MB with progress tracking
- **Multi-Part Upload** for robust large files
- **Drag & Drop UI** for modern UX
- **Redis Caching** for performance
- **Volume Storage** for persistent files
- **Auto-Cleanup** for expired content
- **Monitoring & Statistics** for operations
- **Scalability** through Railway.app infrastructure

The platform is now ready for production use with extended file-sharing capabilities.