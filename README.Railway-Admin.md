# Admin Dashboard für Railway.app

## 🚀 Einrichtung auf Railway.app

### 1. Umgebungsvariablen setzen

Gehen Sie zu Ihrem Railway-Projekt und setzen Sie folgende Umgebungsvariablen:

```
ADMIN_TOKEN=your-secure-admin-token-here
SPAM_FILTER_ENABLED=true
SPAM_SCORE_THRESHOLD=50
RATE_LIMIT_MAX_REQUESTS=20
RATE_LIMIT_WINDOW_MS=900000
NODE_ENV=production
```

**Wichtig**: Wählen Sie einen sicheren Admin-Token! Verwenden Sie einen starken, zufälligen String.

### 2. Dashboard-Zugriff

Nach dem Deployment können Sie das Admin-Dashboard unter folgender URL erreichen:

```
https://your-app-name.railway.app/admin
```

## 🔐 Authentifizierung

Das Dashboard verwendet Token-basierte Authentifizierung. Der Admin-Token wird als `ADMIN_TOKEN` Umgebungsvariable gesetzt.

**Standard-Token**: `qopy-admin-2024` (nur für Entwicklung!)

## 📊 Dashboard-Funktionen

### 1. Übersicht (Statistiken)
- **Aktive Clips**: Anzahl der momentan gespeicherten Clips
- **Blockierte IPs**: Gesamtzahl der blockierten IP-Adressen
- **Blockierter Spam**: Anzahl der blockierten Spam-Inhalte
- **Server-Uptime**: Laufzeit des Servers

### 2. IP-Management
- **IP-Adressen blockieren**: Manuelle Blockierung von IP-Adressen
- **IP-Adressen freigeben**: Entfernen von IPs aus der Blacklist
- **Automatische Blockierung**: IPs werden automatisch bei hohen Spam-Scores blockiert

### 3. System-Logs
- **Echtzeit-Logs**: Live-Ansicht der letzten 100 Log-Einträge
- **Filter-Optionen**: Logs nach Level filtern (info, warn, error)
- **Railway-Integration**: Logs werden automatisch in Railway's Logging-System übertragen

### 4. Spam-Statistiken
- **Erkennungsrate**: Prozentsatz der erkannten Spam-Inhalte
- **Blockierungsrate**: Prozentsatz der blockierten Inhalte
- **Konfiguration**: Aktuelle Spam-Filter-Einstellungen

## 🛠 Railway-spezifische Funktionen

### Logging Integration

Das Dashboard integriert sich perfekt mit Railway's Logging-System:

```javascript
// Alle Logs erscheinen automatisch in Railway's Log-Viewer
console.log('Message'); // -> Railway Logs
console.error('Error'); // -> Railway Logs
console.warn('Warning'); // -> Railway Logs
```

### Automatische Umgebungserkennung

```javascript
// In production (Railway) automatisch trust proxy
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
```

### Health-Checks

Railway kann automatisch Health-Checks durchführen:

```
GET https://your-app.railway.app/api/health
```

## 🔧 Deployment-Konfiguration

### Dockerfile (falls verwendet)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Railway-Konfiguration

```toml
# railway.toml
[build]
  builder = "NIXPACKS"

[deploy]
  startCommand = "npm start"
  healthcheckPath = "/api/health"
  healthcheckTimeout = 10
  restartPolicyType = "ON_FAILURE"
```

## 📱 Mobile-Optimierung

Das Admin-Dashboard ist vollständig responsive und funktioniert auf:
- Desktop-Browsern
- Tablets
- Smartphones

## 🔐 Sicherheits-Features

### 1. Token-Authentifizierung
- Sichere Bearer-Token-Authentifizierung
- Tokens werden über HTTPS übertragen
- Keine Session-Cookies

### 2. Rate-Limiting
- Automatisches Rate-Limiting für alle Admin-Endpoints
- Schutz vor Brute-Force-Angriffen

### 3. IP-Blacklisting
- Automatische Blockierung bei verdächtigen Aktivitäten
- Manuelle IP-Verwaltung
- Externe Spam-Listen-Integration

### 4. Logging & Monitoring
- Detaillierte Logs aller Admin-Aktivitäten
- Automatische Benachrichtigungen bei kritischen Ereignissen
- Integration mit Railway's Monitoring

## 🚨 Wichtige Sicherheitshinweise

### 1. Admin-Token ändern
```bash
# Setzen Sie immer einen sicheren Admin-Token
ADMIN_TOKEN=your-very-secure-random-token-here
```

### 2. HTTPS verwenden
Railway stellt automatisch HTTPS bereit. Zugriff nur über sichere Verbindungen.

### 3. IP-Whitelisting (optional)
Für extra Sicherheit können Sie Admin-Zugriff auf bestimmte IPs beschränken.

### 4. Regelmäßige Überwachung
- Überprüfen Sie regelmäßig die Logs
- Monitoren Sie ungewöhnliche Aktivitäten
- Aktualisieren Sie Spam-Listen regelmäßig

## 🔄 Automatische Updates

### Spam-Listen aktualisieren

Das System aktualisiert automatisch alle 24 Stunden die Spam-IP-Listen. Manuelle Updates sind über das Dashboard möglich.

### Logs-Rotation

Logs werden automatisch rotiert (max. 1000 Einträge), um Speicher zu schonen.

## 📞 Support & Troubleshooting

### Häufige Probleme

1. **Admin-Dashboard nicht erreichbar**
   - Überprüfen Sie die Railway-Deployment-Logs
   - Stellen Sie sicher, dass Port 3000 freigegeben ist

2. **Login funktioniert nicht**
   - Überprüfen Sie die `ADMIN_TOKEN` Umgebungsvariable
   - Stellen Sie sicher, dass Sie `Bearer ` vor dem Token verwenden

3. **Logs werden nicht angezeigt**
   - Überprüfen Sie die Berechtigung des Admin-Tokens
   - Stellen Sie sicher, dass das Logging-System aktiv ist

### Railway-Logs überprüfen

```bash
# Railway CLI installieren
npm install -g @railway/cli

# Logs anzeigen
railway logs
```

### Debug-Modus aktivieren

```bash
# Umgebungsvariable setzen
DEBUG=true
```

## 🎯 Best Practices

1. **Regelmäßige Backups**: Exportieren Sie wichtige Blacklist-Daten
2. **Monitoring**: Überwachen Sie Spam-Trends und -Muster
3. **Updates**: Halten Sie Spam-Listen aktuell
4. **Dokumentation**: Dokumentieren Sie wichtige IP-Blockierungen
5. **Testing**: Testen Sie das Dashboard regelmäßig

---

**Tipp**: Nutzen Sie Railway's Built-in Metrics für zusätzliche Überwachung Ihrer Anwendung! 