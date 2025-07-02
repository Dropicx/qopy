# PostgreSQL Setup für Railway

Diese Anleitung zeigt, wie du Qopy mit PostgreSQL auf Railway deployst für vollständige Datenpersistenz.

## 🚀 Schnellstart

### 1. PostgreSQL Plugin hinzufügen
1. Gehe zu deinem Railway Projekt
2. Klicke "New" → "Database" → "PostgreSQL"
3. Railway erstellt automatisch die `DATABASE_URL` Environment Variable

### 2. Konfiguration wechseln
```bash
# Rename die PostgreSQL-Konfiguration
mv railway-postgres.toml railway.toml
```

### 3. Deploy
Railway wird automatisch:
- ✅ PostgreSQL-Datenbank initialisieren
- ✅ Alle Tabellen erstellen
- ✅ Indexe für Performance erstellen
- ✅ Server mit PostgreSQL starten

## 📊 Was passiert

### Vorher (SQLite):
- ❌ Clips gehen bei Redeploy verloren
- ❌ Ephemeral filesystem
- ❌ Nur für Testing geeignet

### Nachher (PostgreSQL):
- ✅ **Vollständige Persistenz** - Clips überleben Redeploys
- ✅ **Production-ready** Datenbank
- ✅ **Skalierbar** für hohen Traffic
- ✅ **Backup-Support** via Railway
- ✅ **User Management** vorbereitet

## 🔧 Environment Variables

Railway setzt automatisch:
```bash
DATABASE_URL=postgresql://username:password@host:port/database
NODE_ENV=production
RAILWAY_ENVIRONMENT=true
```

Du musst nur setzen:
```bash
ADMIN_TOKEN=your-secure-admin-token
```

## 📋 Tabellen-Schema

### clips
- `id` - Auto-increment Primary Key
- `clip_id` - 6-stellige Unique ID
- `content` - Geteilter Text
- `password_hash` - Optionales Passwort
- `expiration_time` - Ablaufzeit (Unix Timestamp)
- `created_at` - Erstellungszeit
- `accessed_at` - Letzter Zugriff
- `access_count` - Anzahl Zugriffe
- `one_time` - Einmaliger Zugriff
- `is_expired` - Abgelaufen Status
- `created_by_ip` - IP des Erstellers
- `user_agent` - Browser Info

### users (für zukünftige Features)
- `id` - Primary Key
- `username` - Unique Username
- `email` - Unique Email
- `password_hash` - Gehashtes Passwort
- `created_at` - Account Erstellung
- `last_login` - Letzter Login
- `is_active` - Account Status
- `is_admin` - Admin Rechte
- `subscription_type` - Premium Status
- `subscription_expires` - Abo Ablauf

### user_clips (Verknüpfung)
- `id` - Primary Key
- `user_id` - Foreign Key zu users
- `clip_id` - Foreign Key zu clips
- `created_at` - Verknüpfungszeit

### access_logs (Analytics)
- `id` - Primary Key
- `clip_id` - Foreign Key zu clips
- `ip_address` - IP des Zugreifenden
- `user_agent` - Browser Info
- `accessed_at` - Zugriffszeit
- `success` - Erfolgreicher Zugriff
- `error_message` - Fehlermeldung

## 🎯 Nächste Schritte

1. **PostgreSQL Plugin** in Railway hinzufügen
2. **`railway-postgres.toml`** zu `railway.toml` umbenennen
3. **`ADMIN_TOKEN`** setzen
4. **Deploy** - Railway macht den Rest automatisch
5. **Testen** - Clips bleiben nach Redeploy erhalten

## 🔍 Monitoring

### Health Check
```bash
curl https://your-app.railway.app/api/health
```

### Admin Dashboard
```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
     https://your-app.railway.app/api/admin/dashboard
```

## 🛠️ Troubleshooting

### DATABASE_URL nicht gefunden
- PostgreSQL Plugin in Railway hinzufügen
- Warte auf Provisioning
- Prüfe Environment Variables

### Connection Error
- Prüfe SSL-Einstellungen
- Warte auf Datenbank-Start
- Prüfe Railway Logs

### Build Error
- Prüfe `pg` Dependency in package.json
- Clear Railway Cache
- Redeploy

## 📈 Performance

PostgreSQL bietet:
- **Bessere Performance** bei vielen Clips
- **Automatische Optimierung**
- **Connection Pooling**
- **Index-basierte Queries**
- **Skalierbarkeit**

## 🔒 Sicherheit

- **SSL-Verbindungen** in Production
- **Connection Pooling** für Stabilität
- **Prepared Statements** gegen SQL Injection
- **Automatische Cleanup** abgelaufener Clips

---

**Fertig!** Deine Qopy-App läuft jetzt mit vollständiger Datenpersistenz auf Railway. 🎉 