# SIGTERM Debug-Handbuch für Railway

## 🚨 SIGTERM-Fehler Debugging

SIGTERM-Signale sind **normal** bei Railway-Deployments, aber können auf Probleme hinweisen. Dieses Handbuch hilft beim Debugging.

## 🔍 Aktivierung des Debug-Modus

### 1. Railway Umgebungsvariable setzen:
```bash
DEBUG=true
```

### 2. Erweiterte Logging-Optionen:
```bash
DEBUG=true
SHUTDOWN_TIMEOUT=60000    # 60 Sekunden für Graceful Shutdown
NODE_ENV=production
```

## 📊 Debug-Endpoints nutzen

Nach dem Deployment sind folgende Debug-Endpoints verfügbar:

### **Process Information**
```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  https://your-app.railway.app/api/admin/debug/process
```

### **Server Status**
```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  https://your-app.railway.app/api/admin/debug/server
```

### **Memory Analysis**
```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  https://your-app.railway.app/api/admin/debug/memory
```

### **Signal Information**
```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  https://your-app.railway.app/api/admin/debug/signals
```

### **Complete Debug Dump**
```bash
curl -X POST -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  https://your-app.railway.app/api/admin/debug/dump
```

## 🔍 Railway Log-Analyse

### Typische SIGTERM-Ursachen:

#### 1. **Normale Deployments**
```
📡 SIGTERM signal received
Source: Railway/Container orchestrator
Reason: Deployment, scaling, or maintenance
```
**→ Normal, kein Problem**

#### 2. **Memory-Limits erreicht**
```
⚠️ High memory usage detected
Memory: { rss: 512, heapUsed: 256 }
📡 SIGTERM signal received
```
**→ Speicher-Optimierung nötig**

#### 3. **Health-Check Failures**
```
❌ Health check failed
HEALTHCHECK --interval=30s failed
📡 SIGTERM signal received
```
**→ Health-Check-Endpoint prüfen**

#### 4. **Startup-Timeouts**
```
🚀 Starting Qopy server...
⚠️ Warning: Could not update spam lists
💥 Forced shutdown after timeout
```
**→ Startup-Prozess zu langsam**

## 🛠 Debugging-Strategien

### **1. Railway Logs in Echtzeit**
```bash
# Railway CLI installieren
npm install -g @railway/cli

# Login
railway login

# Logs verfolgen
railway logs --follow
```

### **2. Admin-Dashboard nutzen**
- Besuchen Sie `https://your-app.railway.app/admin`
- Klicken Sie auf "System" Tab
- Überprüfen Sie Memory-Usage und Uptime

### **3. Debug-Signale senden**
Bei aktiviertem Debug-Modus:

```bash
# Process-Info abrufen (nur wenn Container-Zugriff möglich)
kill -USR1 <PID>

# Garbage Collection forcieren
kill -USR2 <PID>
```

## 🔧 Häufige Lösungen

### **Memory-Probleme**
```bash
# Railway Umgebungsvariablen setzen:
NODE_OPTIONS="--max-old-space-size=512"
SHUTDOWN_TIMEOUT=60000
```

### **Startup-Timeouts**
```bash
# Längere Health-Check-Timeouts
# In railway.toml:
healthcheckTimeout = 60
```

### **Spam-Liste-Downloads**
```bash
# Fallback wenn externe Listen nicht erreichbar sind
# Server startet trotzdem ohne Listen
```

## 📈 Monitoring & Alerts

### **1. Railway Built-in Metrics**
- CPU Usage
- Memory Usage  
- Request Rate
- Error Rate

### **2. Custom Health-Checks**
```bash
# Testen Sie regelmäßig:
curl https://your-app.railway.app/api/health
```

### **3. Admin-Dashboard Monitoring**
- Aktive Clips
- Blockierte IPs
- Memory Usage
- Server Uptime

## 🚨 Kritische SIGTERM-Situationen

### **Sofort handeln bei:**

#### 1. **Rapid Restart Loop**
```
🚀 Starting Qopy server...
📡 SIGTERM signal received
🚀 Starting Qopy server...
📡 SIGTERM signal received
```
**→ Health-Check oder Startup-Problem**

#### 2. **Memory Leak**
```
⚠️ High memory usage detected
Memory: { rss: 1024, heapUsed: 800 }
💥 Forced shutdown after timeout
```
**→ Memory-Limit erhöhen oder Code optimieren**

#### 3. **Ungraceful Shutdowns**
```
💥 Forced shutdown after timeout
Exit code: 1
```
**→ Shutdown-Timeout erhöhen**

## 🔧 Railway-Spezifische Konfiguration

### **railway.toml optimieren:**
```toml
[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 60              # Längere Timeouts
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3

[build]
buildCommand = "npm ci && npm run setup-admin"
```

### **Dockerfile optimieren:**
```dockerfile
# Graceful shutdown support
STOPSIGNAL SIGTERM

# Health check with longer timeout
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3

# Debug mode support
ENV DEBUG=false
ENV SHUTDOWN_TIMEOUT=30000
```

## 📋 Debug-Checklist

### **Bei SIGTERM-Problemen prüfen:**

- [ ] Railway Logs für Error-Pattern
- [ ] Memory-Usage über Zeit
- [ ] Health-Check Status
- [ ] Admin-Token korrekt gesetzt
- [ ] Spam-Listen-Download erfolgreich
- [ ] Node.js Version kompatibel
- [ ] Dependencies vollständig installiert
- [ ] Port 3000 korrekt exposed
- [ ] Graceful Shutdown funktioniert

### **Debug-Commands ausführen:**

- [ ] `GET /api/health` → Status OK?
- [ ] `GET /api/admin/debug/process` → Memory OK?
- [ ] `GET /api/admin/debug/server` → Connections normal?
- [ ] `POST /api/admin/debug/dump` → Vollständige Analyse

## 🎯 Performance-Optimierung

### **Memory-Optimierung:**
```javascript
// In server.js bereits implementiert:
- Automatische Log-Rotation (max 1000 Einträge)
- Memory-Monitoring bei DEBUG=true
- Graceful Cleanup bei Shutdown
- V8 Garbage Collection Support
```

### **Startup-Optimierung:**
```bash
# Parallele Spam-Listen-Downloads
# Fallback wenn Listen nicht verfügbar
# Schnellerer Container-Start
```

## 📞 Support

### **1. Railway Support**
```bash
# Railway CLI
railway status
railway logs
railway variables
```

### **2. Debug-Informationen sammeln**
```bash
# Admin-Dashboard: /admin → System Tab
# Debug-Dump: POST /api/admin/debug/dump
# Railway Logs: railway logs --follow
```

### **3. Typische Lösungszeiten**
- Normal Restart: 10-30 Sekunden
- Memory-Problem: Sofortige Neuplanung
- Health-Check-Fail: 1-2 Minuten Retry

---

**💡 Tipp**: Aktivieren Sie `DEBUG=true` in Railway für detaillierte Logs bei Problemen! 