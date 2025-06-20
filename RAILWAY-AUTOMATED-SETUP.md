# Railway Automatisierte Setup-Commands

## 🚀 Vollständig Automatisierte Deployment-Pipeline

Alle notwendigen Commands werden automatisch bei Railway-Deployments ausgeführt. Sie müssen **keine manuellen Commands** ausführen!

## 📋 Automatisierte Commands Übersicht

### 1. **Build-Time (railway.toml)**
```bash
# Wird automatisch beim Build ausgeführt:
node scripts/check-npm-version.js    # NPM-Version prüfen
npm ci --only=production              # Dependencies installieren
npm run setup-admin                   # Admin-Dashboard konfigurieren
```

### 2. **Deployment-Time (railway.toml)**
```bash
# Wird automatisch beim Deployment-Start ausgeführt:
npm run railway-deploy    # Railway-spezifisches Setup
npm start                 # Server starten
```

### 3. **Container-Start (Dockerfile)**
```bash
# Wird automatisch beim Container-Start ausgeführt:
/app/startup.sh           # Startup-Script mit folgenden Tasks:
  - Spam-IP-Listen aktualisieren (falls nötig)
  - Admin-Dashboard-URL anzeigen
  - Server starten
```

## 🎛️ Admin-Dashboard Setup

### Automatisch generiert:
- ✅ **Admin-Token**: Sicherer, zufälliger Token
- ✅ **Konfigurationsdateien**: .env.example, ADMIN-QUICKSTART.md
- ✅ **Dashboard-Dateien**: public/admin.html mit vollem UI

### Nach dem Deployment verfügbar:
```
https://your-app.railway.app/admin
```

## 📥 Spam-IP-Listen

### Automatisch geladen:
- ✅ **Spamhaus DROP List**: Bekannte Spam-/Bot-Netzwerke
- ✅ **Emerging Threats**: Malware und C&C Server IPs
- ✅ **Automatische Updates**: Alle 24 Stunden

### Fallback-Strategie:
- Build-Time: Versucht Download, weiter bei Fehler
- Runtime: Versucht Download beim Start, weiter bei Fehler
- Backup: Funktioniert auch ohne externe Listen

## 🔧 Railway-Spezifische Features

### Umgebungsvariablen (automatisch erkannt):
```bash
RAILWAY_ENVIRONMENT      # Umgebung (production/staging)
RAILWAY_SERVICE_NAME     # Service-Name
RAILWAY_PUBLIC_DOMAIN    # Öffentliche Domain
RAILWAY_REGION           # Deployment-Region
```

### Logging Integration:
- ✅ Alle Server-Logs → Railway Logs
- ✅ Admin-Aktivitäten → Railway Logs
- ✅ Spam-Blockierungen → Railway Logs
- ✅ IP-Blockierungen → Railway Logs

## 📊 Deployment-Verlauf

### 1. **Railway Build Phase**
```
🔍 Checking npm version...
📦 Installing dependencies...
🎛️ Setting up admin dashboard...
✅ Build completed
```

### 2. **Railway Deploy Phase**
```
🚀 Railway Deployment für Qopy gestartet...
📁 Erstelle Verzeichnisse...
🎛️ Admin bereits eingerichtet ✅
📥 Aktualisiere Spam-IP-Listen...
📊 X Spam-IPs geladen
🎯 Railway Deployment Informationen
✅ Railway Deployment erfolgreich abgeschlossen!
```

### 3. **Container Start Phase**
```
🚀 Starting Qopy with automated setup...
📥 Updating spam IP lists...
🎛️ Admin Dashboard available at: https://xxx.railway.app/admin
🔑 Check ADMIN-QUICKSTART.md for login token
🚀 Qopy Server running on port 3000
```

## 🔐 Sicherheits-Features (Automatisch)

### Automatisch aktiviert:
- ✅ **Rate Limiting**: 20 Requests pro 15 Minuten
- ✅ **IP Blacklisting**: Automatische Spam-IP-Blockierung
- ✅ **Helmet Security**: Standard-Sicherheitsheader
- ✅ **CORS Protection**: Cross-Origin-Schutz
- ✅ **Trust Proxy**: Railway-Proxy-Erkennung

### Admin-Authentifizierung:
- ✅ **Token-basiert**: Sichere Bearer-Token
- ✅ **HTTPS-Only**: Railway stellt automatisch HTTPS bereit
- ✅ **No-Session**: Stateless Authentication

## 📱 Sofort verfügbare URLs

Nach erfolgreichem Deployment:

```bash
# Hauptanwendung
https://your-app.railway.app/

# Admin-Dashboard
https://your-app.railway.app/admin

# Health-Check
https://your-app.railway.app/api/health

# API-Dokumentation im Dashboard verfügbar
```

## 🛠 Was Sie tun müssen

### Nur diese Schritte:

1. **Umgebungsvariablen in Railway setzen:**
   ```
   ADMIN_TOKEN=your-secure-token-here
   ```
   (Optional - Standard-Token funktioniert auch)

2. **Deployment abwarten** 
   (Alles andere passiert automatisch)

3. **Admin-Dashboard besuchen**
   ```
   https://your-app.railway.app/admin
   ```

### Das war's! 🎉

## 🚨 Troubleshooting

### Falls etwas schief geht:

1. **Railway Logs überprüfen:**
   ```bash
   # In Railway Dashboard → Deployments → Logs
   ```

2. **Health-Check testen:**
   ```bash
   curl https://your-app.railway.app/api/health
   ```

3. **Admin-Token prüfen:**
   - Schauen Sie in die Railway Logs nach dem generierten Token
   - Oder setzen Sie einen eigenen via `ADMIN_TOKEN` Umgebungsvariable

## 📈 Performance-Optimierung

### Automatisch implementiert:
- ✅ **Multi-Stage Docker Build**: Optimierte Container-Größe
- ✅ **NPM Cache**: Schnellere Builds
- ✅ **Gzip Compression**: Schnellere Response-Zeiten
- ✅ **Health Checks**: Automatische Verfügbarkeitsprüfung
- ✅ **Graceful Shutdown**: Sauberer Container-Stop

## 🎯 Monitoring

### Automatisch verfügbar:
- Railway Built-in Metrics
- Custom Health-Check Endpoint
- Admin-Dashboard mit Live-Statistiken
- Strukturierte Logs für Analyse

---

**✨ Alles läuft automatisch - Sie müssen sich um nichts kümmern!** 