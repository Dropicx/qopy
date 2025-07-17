# Qopy Deployment auf Railway.app

## 🚀 Multi-Part Upload & File-Sharing Deployment Guide

### Übersicht
Diese Anleitung beschreibt das Deployment der erweiterten Qopy-Version mit Multi-Part Upload und File-Sharing-Funktionalität auf Railway.app.

### Services die benötigt werden

#### 1. PostgreSQL Database
```
Plugin: PostgreSQL
- Automatische Bereitstellung
- DATABASE_URL wird automatisch gesetzt
- Führe das database-migration.sql Skript aus
```

#### 2. Redis Service (für Upload-Session-Caching)
```
Plugin: Redis
- Automatische Bereitstellung
- REDIS_URL wird automatisch gesetzt
- Optional aber empfohlen für Performance
```

#### 3. Volume Storage (für File-Uploads)
```
Service: Volume
- Mount Path: /app/uploads
- Größe: Mindestens 10GB (empfohlen: 50GB+)
- Umgebungsvariable: RAILWAY_VOLUME_MOUNT_PATH=/app/uploads
```

### Deployment-Schritte

#### Schritt 1: Repository Vorbereitung
```bash
# 1. Repository klonen/forken
git clone [repository-url]
cd qopy

# 2. Dependencies installieren (lokal testen)
npm install

# 3. Neue Dateien hinzugefügt:
# - scripts/database-migration.sql
# - public/file-upload.js
# - Erweiterte server.js mit Upload-APIs
# - Erweiterte index.html mit File-Upload-UI
# - Erweiterte styles.css mit File-Upload-Styles
```

#### Schritt 2: Railway.app Setup
1. **Neues Projekt erstellen**
   - GitHub Repository verbinden
   - Railway erkennt automatisch Node.js

2. **PostgreSQL Plugin hinzufügen**
   ```
   Dashboard → Add Plugin → PostgreSQL
   ```

3. **Redis Plugin hinzufügen**
   ```
   Dashboard → Add Plugin → Redis
   ```

4. **Volume erstellen**
   ```
   Dashboard → Add Volume
   - Name: qopy-files
   - Mount Path: /app/uploads
   - Size: 50GB
   ```

5. **Environment Variables setzen**
   ```
   DATABASE_URL=postgresql://... (automatisch gesetzt)
   REDIS_URL=redis://... (automatisch gesetzt)
   RAILWAY_VOLUME_MOUNT_PATH=/app/uploads
   NODE_ENV=production
   PORT=8080 (automatisch gesetzt)
   ```

#### Schritt 3: Database Migration
Nach dem ersten Deployment:

```bash
# Railway CLI installieren (wenn nicht vorhanden)
npm install -g @railway/cli

# Mit Railway verbinden
railway login
railway link [project-id]

# Database Migration ausführen
railway run psql $DATABASE_URL -f scripts/database-migration.sql
```

Oder über das Railway Dashboard:
1. PostgreSQL Service → Connect → Query
2. Inhalt von `scripts/database-migration.sql` kopieren und ausführen

### Features nach Deployment

#### Text-Sharing (erweitert)
- **Unveränderte UI**: Bestehende Text-Sharing-Funktionalität bleibt identisch
- **Neue Backend-Architektur**: Nutzt jetzt das Multi-Part-System für Konsistenz
- **Größere Inhalte**: Inhalte >1MB werden automatisch als Files gespeichert
- **Bessere Performance**: Redis-Caching für Session-Management

#### File-Sharing (neu)
- **Multi-Part Upload**: Chunks bis 5MB für robuste Uploads
- **File-Größe**: Bis 100MB pro File
- **Alle Dateitypen**: Unterstützt alle MIME-Types
- **Progress Tracking**: Real-time Upload-Fortschritt
- **Drag & Drop**: Moderne Upload-UI
- **Download-Management**: Streaming Downloads mit Progress

#### Upload-Management
- **Upload-Sessions**: Persistente Upload-Verwaltung
- **Chunk-Validierung**: SHA256-Checksums für Integrität
- **Fehler-Recovery**: Automatisches Retry für failed Chunks
- **Cleanup**: Automatische Bereinigung expired Uploads

### Monitoring & Wartung

#### Logs überwachen
```bash
# Deployment-Logs
railway logs

# Database-Logs
railway logs --service postgresql

# Redis-Logs  
railway logs --service redis
```

#### Storage-Überwachung
```bash
# Volume-Usage prüfen
railway shell
df -h /app/uploads
```

#### Database-Wartung
```sql
-- Upload-Statistiken
SELECT 
    date,
    total_uploads,
    completed_uploads,
    failed_uploads,
    total_file_size / (1024*1024) as total_mb
FROM upload_statistics 
ORDER BY date DESC LIMIT 30;

-- Aktive Upload-Sessions
SELECT 
    upload_id,
    filename,
    status,
    uploaded_chunks,
    total_chunks,
    (uploaded_chunks::float / total_chunks * 100)::int as progress_percent
FROM upload_sessions 
WHERE status = 'uploading';

-- Storage-Usage
SELECT 
    content_type,
    COUNT(*) as count,
    SUM(filesize) / (1024*1024) as total_mb
FROM clips 
WHERE created_at > extract(epoch from now() - interval '30 days') * 1000
GROUP BY content_type;
```

### Performance-Optimierungen

#### Redis-Konfiguration
```
maxmemory-policy: allkeys-lru
maxmemory: 256mb
```

#### PostgreSQL-Tuning
```sql
-- Connection Pooling (bereits implementiert)
max_connections = 100

-- Index-Optimierung
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clips_created_at_desc ON clips(created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_upload_sessions_last_activity ON upload_sessions(last_activity);
```

#### File-System-Optimierung
- Volume wird automatisch von Railway.app optimiert
- SSD-basierte Storage für beste Performance
- Automatische Backups durch Railway

### Sicherheits-Features

#### Rate Limiting
- **Upload-Limits**: 10 Upload-Sessions pro IP/15min
- **File-Size-Limits**: 100MB pro File
- **Chunk-Validation**: SHA256-Integrität
- **Malware-Schutz**: Durch MIME-Type-Validation

#### Privacy & Compliance
- **Zero-Knowledge**: Server sieht keine unverschlüsselten Inhalte
- **Auto-Expiration**: Automatische Löschung nach Ablauf
- **IP-Anonymisierung**: Keine persistente IP-Speicherung
- **GDPR-Konform**: Privacy-by-Design Architektur

### Kosten-Schätzung (Railway.app)

#### Basis-Setup
```
App Instance:     $5-20/Monat (je nach CPU/RAM)
PostgreSQL:       $5/Monat (Starter)
Redis:            $3/Monat (Starter)
Volume (50GB):    $5/Monat
Total:            ~$18-33/Monat
```

#### Scaling-Optionen
```
App Instances:    Horizontal scaling möglich
Database:         Vertical scaling auf Railway Pro
Redis:            Cluster-Mode für High-Availability
Volume:           Bis zu 100GB+ möglich
```

### Troubleshooting

#### Upload-Probleme
```javascript
// Client-seitige Debug-Logs
console.log('🔍 Upload Debug Info:');
console.log('File size:', file.size);
console.log('Chunk size:', CHUNK_SIZE);
console.log('Total chunks:', Math.ceil(file.size / CHUNK_SIZE));
```

#### Storage-Probleme
```bash
# Volume-Space prüfen
railway shell
du -sh /app/uploads/*

# Cleanup manuell triggern
curl -X POST https://your-app.railway.app/api/admin/cleanup
```

#### Database-Performance
```sql
-- Slow Query Analysis
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY total_time DESC LIMIT 10;
```

### Migration von bestehender Qopy-Installation

#### Daten-Migration
```sql
-- Backup bestehender Daten
pg_dump $OLD_DATABASE_URL > qopy_backup.sql

-- Import in neue Datenbank
psql $NEW_DATABASE_URL < qopy_backup.sql

-- Schema-Update anwenden
psql $NEW_DATABASE_URL -f scripts/database-migration.sql
```

#### Zero-Downtime Deployment
1. Neue Railway-App parallel deployen
2. Domain-Switch vorbereiten
3. Letztes Backup erstellen
4. DNS auf neue App umstellen
5. Alte App nach 24h deaktivieren

### Support & Wartung

#### Automatische Backups
Railway.app erstellt automatisch:
- **Database-Backups**: Täglich
- **Volume-Snapshots**: Bei Bedarf
- **Application-Rollbacks**: Git-basiert

#### Monitoring
```javascript
// Health-Check Endpoints
GET /health          // Basis-Health
GET /api/health      // API-Health mit DB-Test
GET /ping           // Simple Ping
```

#### Updates
```bash
# Code-Updates
git pull origin main
git push railway main

# Database-Schema-Updates
railway run psql $DATABASE_URL -f new-migration.sql
```

---

**🎉 Nach erfolgreichem Deployment hast du eine vollwertige Multi-Part Upload & File-Sharing-Platform mit:**

✅ **Text-Sharing** (erweitert & optimiert)
✅ **File-Upload** bis 100MB mit Progress-Tracking
✅ **Multi-Part Upload** für robuste große Files
✅ **Drag & Drop UI** für moderne UX
✅ **Redis-Caching** für Performance
✅ **Volume-Storage** für persistente Files
✅ **Auto-Cleanup** für expired Content
✅ **Monitoring & Statistics** für Operations
✅ **Skalierbarkeit** durch Railway.app Infrastructure

Die Plattform ist nun bereit für produktiven Einsatz mit erweiterten File-Sharing-Capabilities! 🚀 