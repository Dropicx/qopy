# 🚀 Qopy Database Migration Guide

Nach dem Merge von `dev` in `main` wurden umfangreiche File-Sharing Features hinzugefügt. Diese Anleitung hilft Ihnen bei der korrekten Datenbank-Migration.

## ✨ Was ist neu?

### 📁 File-Sharing Features
- **Multi-Part Upload System** - Effizientes Hochladen großer Dateien in Chunks
- **Verschlüsselte Dateispeicherung** - Client-seitige Verschlüsselung vor dem Upload
- **Download-Token System** - Sichere Authentifizierung für Datei-Downloads
- **Erweiterte Clip-Verwaltung** - Unterstützung für Text und Dateien

### 🗄️ Neue Datenbank-Tabellen
- `upload_sessions` - Verwaltung von Multi-Part Uploads
- `file_chunks` - Temporäre Speicherung von Upload-Chunks
- `upload_statistics` - Monitoring und Statistiken
- Erweiterte `clips` Tabelle mit File-Metadaten

## 🔄 Automatische Migration

**Die Migration läuft automatisch beim Server-Start!** Sie müssen nichts manuell ausführen.

```bash
# Starten Sie einfach den Server
npm start
```

Die Migration erstellt automatisch:
- ✅ Alle notwendigen Tabellen
- ✅ Indizes für bessere Performance
- ✅ Foreign Key Constraints
- ✅ Datenbank-Funktionen und Trigger
- ✅ Validierung der Schema-Integrität

## 🧪 Migration testen

Vor dem ersten Start können Sie die Migration testen:

```bash
# Migration testen (optional)
npm run test-migration

# Erwartete Ausgabe:
# 🧪 Starting Database Migration Test...
# ✅ Database connection established
# 📋 Test 1: Checking required tables...
#   ✅ Table 'clips' exists
#   ✅ Table 'statistics' exists
#   ✅ Table 'upload_sessions' exists
#   ✅ Table 'file_chunks' exists
#   ✅ Table 'upload_statistics' exists
# 🎉 All database migration tests completed successfully!
```

## 🛠️ Manuelle Migration (falls erforderlich)

Falls die automatische Migration nicht funktioniert:

```bash
# Manuelle Migration ausführen
npm run migrate

# Oder direkt mit psql
psql $DATABASE_URL -f scripts/database-migration.sql
```

## 📊 Datenbank-Schema Übersicht

### 📋 clips (Erweitert)
```sql
CREATE TABLE clips (
    id SERIAL PRIMARY KEY,
    clip_id VARCHAR(10) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    one_time BOOLEAN DEFAULT false,
    quick_share BOOLEAN DEFAULT false,
    expiration_time BIGINT NOT NULL,
    access_count INTEGER DEFAULT 0,
    created_at BIGINT NOT NULL,
    accessed_at BIGINT,
    is_expired BOOLEAN DEFAULT false,
    
    -- Neue File-Support Spalten
    content_type VARCHAR(20) DEFAULT 'text',
    file_metadata JSONB,
    file_path VARCHAR(500),
    original_filename VARCHAR(255),
    mime_type VARCHAR(100),
    filesize BIGINT,
    is_file BOOLEAN DEFAULT false,
    content BYTEA
);
```

### 📤 upload_sessions (Neu)
```sql
CREATE TABLE upload_sessions (
    id SERIAL PRIMARY KEY,
    upload_id VARCHAR(50) UNIQUE NOT NULL,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    filesize BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    chunk_size INTEGER NOT NULL DEFAULT 5242880,
    total_chunks INTEGER NOT NULL,
    uploaded_chunks INTEGER DEFAULT 0,
    checksums TEXT[],
    status VARCHAR(20) DEFAULT 'uploading',
    expiration_time BIGINT NOT NULL,
    has_password BOOLEAN DEFAULT false,
    one_time BOOLEAN DEFAULT false,
    quick_share BOOLEAN DEFAULT false,
    is_text_content BOOLEAN DEFAULT false,
    client_ip VARCHAR(45),
    created_at BIGINT NOT NULL,
    last_activity BIGINT NOT NULL,
    completed_at BIGINT
);
```

### 🧩 file_chunks (Neu)
```sql
CREATE TABLE file_chunks (
    id SERIAL PRIMARY KEY,
    upload_id VARCHAR(50) NOT NULL,
    chunk_number INTEGER NOT NULL,
    chunk_size INTEGER NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    created_at BIGINT NOT NULL,
    UNIQUE(upload_id, chunk_number),
    FOREIGN KEY (upload_id) REFERENCES upload_sessions(upload_id) ON DELETE CASCADE
);
```

### 📈 upload_statistics (Neu)
```sql
CREATE TABLE upload_statistics (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    total_uploads INTEGER DEFAULT 0,
    total_file_size BIGINT DEFAULT 0,
    completed_uploads INTEGER DEFAULT 0,
    failed_uploads INTEGER DEFAULT 0,
    text_clips INTEGER DEFAULT 0,
    file_clips INTEGER DEFAULT 0,
    avg_upload_time INTEGER DEFAULT 0,
    UNIQUE(date)
);
```

## 🔧 Umgebungsvariablen

Stellen Sie sicher, dass diese Umgebungsvariablen gesetzt sind:

```bash
# Erforderlich
DATABASE_URL="postgresql://user:password@host:port/database"

# Optional
NODE_ENV="production"  # oder "development"
ADMIN_TOKEN="your-secure-admin-token"
RAILWAY_VOLUME_MOUNT_PATH="/app/data"  # für Railway-Deployment
REDIS_URL="redis://..."  # optional für Caching
```

## 🚨 Troubleshooting

### Problem: Migration schlägt fehl
```bash
❌ Database migration failed: relation "clips" does not exist
```

**Lösung:**
1. Überprüfen Sie die DATABASE_URL
2. Stellen Sie sicher, dass PostgreSQL läuft
3. Führen Sie manuelle Migration aus: `npm run migrate`

### Problem: Fehlende Berechtigungen
```bash
❌ permission denied for schema public
```

**Lösung:**
```sql
-- Als Superuser ausführen
GRANT ALL PRIVILEGES ON SCHEMA public TO your_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_user;
```

### Problem: Veraltete Datenbank-Version
```bash
❌ function "json_build_object" does not exist
```

**Lösung:**
- PostgreSQL 9.4+ erforderlich
- Aktualisieren Sie Ihre PostgreSQL-Installation

## 🔍 Migrations-Log

Die Migration protokolliert alle Schritte ausführlich:

```
🚀 Starting Qopy server with automatic database migration...
✅ Database connection established
🔄 Running automatic database migration...
📊 Creating statistics table...
📋 Creating clips table...
🗂️ Extending clips table for file support...
📤 Creating upload_sessions table...
🧩 Creating file_chunks table...
📈 Creating upload_statistics table...
🔗 Creating database indexes...
⚙️ Creating database functions...
🔄 Creating database triggers...
🧹 Running data migrations...
📊 Initializing default data...
✅ Validating database schema...
✅ Database migration completed successfully!
📊 Tables: clips, statistics, upload_sessions, file_chunks, upload_statistics
🗂️ Clips columns: 18 columns validated
🚀 Qopy server running on port 8080
```

## 🎯 Migration-Checkliste

- [ ] ✅ DATABASE_URL korrekt gesetzt
- [ ] ✅ PostgreSQL 9.4+ läuft
- [ ] ✅ Ausreichende Datenbankberechtigungen
- [ ] ✅ Migration-Test erfolgreich: `npm run test-migration`
- [ ] ✅ Server startet ohne Fehler: `npm start`
- [ ] ✅ Admin-Dashboard erreichbar: `/admin`
- [ ] ✅ Text-Sharing funktioniert
- [ ] ✅ File-Sharing funktioniert

## 📞 Support

Bei Problemen:
1. Führen Sie `npm run test-migration` aus
2. Überprüfen Sie die Server-Logs
3. Konsultieren Sie diese Anleitung
4. Erstellen Sie ein Issue mit den Fehlermeldungen

## 🔄 Rollback (falls erforderlich)

Falls Sie zur vorherigen Version zurückkehren müssen:

```sql
-- Backup erstellen (WICHTIG!)
pg_dump $DATABASE_URL > backup_before_rollback.sql

-- Neue Tabellen entfernen
DROP TABLE IF EXISTS file_chunks CASCADE;
DROP TABLE IF EXISTS upload_sessions CASCADE;
DROP TABLE IF EXISTS upload_statistics CASCADE;

-- Neue Spalten aus clips entfernen
ALTER TABLE clips DROP COLUMN IF EXISTS content_type;
ALTER TABLE clips DROP COLUMN IF EXISTS file_metadata;
ALTER TABLE clips DROP COLUMN IF EXISTS file_path;
ALTER TABLE clips DROP COLUMN IF EXISTS original_filename;
ALTER TABLE clips DROP COLUMN IF EXISTS mime_type;
ALTER TABLE clips DROP COLUMN IF EXISTS filesize;
ALTER TABLE clips DROP COLUMN IF EXISTS is_file;
ALTER TABLE clips DROP COLUMN IF EXISTS content;
```

---

**🎉 Nach erfolgreicher Migration haben Sie Zugang zu allen neuen File-Sharing Features von Qopy!** 