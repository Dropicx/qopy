# Railway Health Check - Systematisches Debugging

## Problem
Railway Health Check schlägt weiterhin mit "service unavailable" fehl trotz aller Fixes.

## Debugging-Strategie

### 1. Minimaler Test-Server
Erstellt: `server-minimal.js` - enthält nur:
- ✅ Express-Basis
- ✅ Health Check Endpoint
- ✅ 0.0.0.0 Host Binding  
- ✅ Einfache Fehlerbehandlung
- ❌ Keine komplexen Features

### 2. Mögliche Ursachen

#### A) Code-Probleme (behoben)
- ❌ `logMessage` vor Definition verwendet → ✅ `simpleLog` erstellt
- ❌ Komplexe Middleware-Stack → ✅ Minimal reduziert
- ❌ Localhost-Binding → ✅ 0.0.0.0 binding

#### B) Railway-spezifische Probleme
- ⚠️ Port-Zuordnung
- ⚠️ Container-Startup-Zeit
- ⚠️ Netzwerk-Routing
- ⚠️ Build-Cache-Probleme

#### C) Dependencies-Probleme
- ⚠️ Missing node_modules
- ⚠️ Package.json Script-Fehler
- ⚠️ Node.js Version-Kompatibilität

### 3. Test-Konfiguration

**Aktuell aktiv:**
```toml
[deploy]
startCommand = "node server-minimal.js"
healthcheckPath = "/api/health"
healthcheckTimeout = 60
```

**Environment:**
```bash
NODE_ENV=production
USE_MINIMAL_SERVER=true
```

### 4. Erwartete Logs

Bei erfolgreichem Start sollten Sie sehen:
```
🚀 Minimal Qopy Server starting...
📋 Port: 3000
📋 Environment: production  
📋 Railway: production
🚀 Minimal Qopy Server running on 0.0.0.0:3000
🩺 Health check: http://0.0.0.0:3000/api/health
🌐 Public: https://your-domain.railway.app
🩺 Health: https://your-domain.railway.app/api/health
```

### 5. Debugging-Commands

Nach dem Deployment testen Sie:

```bash
# 1. Basis-Test
curl https://your-domain.railway.app/

# 2. Health Check
curl https://your-domain.railway.app/api/health

# 3. Mit Details
curl -v https://your-domain.railway.app/api/health

# 4. Direkte IP (falls Domain-Problem)
curl -H "Host: your-domain.railway.app" http://RAILWAY_IP:PORT/api/health
```

### 6. Nächste Schritte

#### Wenn Minimal-Server funktioniert:
1. ✅ Railway-Konfiguration ist korrekt
2. ✅ Schrittweise Features zum full server hinzufügen
3. ✅ Problem isolieren

#### Wenn Minimal-Server fehlschlägt:
1. 🔍 Railway-Build-Logs überprüfen
2. 🔍 Container-Logs überprüfen  
3. 🔍 Netzwerk-Konfiguration prüfen
4. 🔍 Railway-Support kontaktieren

### 7. Rollback-Plan

Falls Tests fehlschlagen:
```bash
# Zurück zum full server
railway.toml: startCommand = "node server.js"

# Oder direkte Fehlerbehebung
railway.toml: startCommand = "npm start"
```

### 8. Erfolgs-Indikatoren

✅ **Railway Deployment logs zeigen:**
- "Minimal Qopy Server running on 0.0.0.0:3000"
- "Health check requested" (bei Health Check)

✅ **Health Check Response:**
```json
{
  "status": "OK",
  "uptime": 123.45,
  "port": 3000,
  "environment": "production",
  "railway": true,
  "version": "1.0.0"
}
```

✅ **Railway Dashboard zeigt:**
- Service: Healthy ✓
- Keine Restart-Loops
- Stabile Memory/CPU

---

## Aktueller Status
🔍 Testing mit `server-minimal.js`  
📋 Railway-Umgebung: Production  
🎯 Ziel: Health Check erfolgreich  

Generated: ${new Date().toISOString()} 