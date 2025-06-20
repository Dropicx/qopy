# IP-Blockierung und Spam-Schutz

Diese Dokumentation erklärt, wie Sie bekannte Spam-IPs abrufen und blockieren können.

## 🚫 Automatische IP-Blockierung

### Grundfunktionalität

Die Anwendung implementiert mehrere Ebenen der IP-Blockierung:

1. **Lokale Blacklist**: Manuell verwaltete Liste von blockierten IPs
2. **Externe Spam-Listen**: Automatisch geladene Listen von bekannten Spam-IPs
3. **Automatische Blockierung**: IPs werden bei sehr hohen Spam-Scores automatisch blockiert

### Konfiguration

```javascript
// In server.js können Sie diese Werte anpassen:
const SPAM_SCORE_THRESHOLD = 50; // Schwellenwert für Spam-Blockierung
```

## 📥 Externe Spam-IP-Quellen

### Unterstützte Quellen

1. **Spamhaus DROP List**: Bekannte Spam-/Bot-Netzwerke
2. **Emerging Threats**: Malware und C&C Server IPs

### Spam-IPs aktualisieren

```bash
# Einmalige Aktualisierung
npm run update-spam-ips

# Oder manuell
node scripts/spam-ip-updater.js
```

### Automatische Updates

Der Server lädt automatisch alle 24 Stunden neue Spam-IP-Listen.

## 🛠 Manuelle IP-Verwaltung

### API-Endpoints (Administratoren)

⚠️ **Warnung**: Diese Endpoints sollten in der Produktion mit Authentifizierung geschützt werden!

#### Alle blockierten IPs anzeigen
```bash
curl http://localhost:3000/api/admin/blacklist
```

#### IP zur Blacklist hinzufügen
```bash
curl -X POST http://localhost:3000/api/admin/blacklist \
  -H "Content-Type: application/json" \
  -d '{"ip": "192.168.1.100", "reason": "Manual spam blocking"}'
```

#### IP von Blacklist entfernen
```bash
curl -X DELETE http://localhost:3000/api/admin/blacklist/192.168.1.100
```

## 📊 Überwachung

### Health-Check Endpoint

```bash
curl http://localhost:3000/api/health
```

Zeigt unter anderem:
- Anzahl blockierter IPs
- Spam-Filter-Statistiken
- Quellen der Blacklists

### Logs

Der Server loggt automatisch:
- Blockierte Requests: `🚫 Blocked request from blacklisted IP: x.x.x.x`
- Neue IPs in Blacklist: `🚫 IP x.x.x.x added to blacklist. Reason: ...`
- Spam-Updates: `📥 Loading X spam IPs from external sources...`

## ⚙️ Erweiterte Konfiguration

### Umgebungsvariablen

```bash
# Spam-Filter aktivieren/deaktivieren
SPAM_FILTER_ENABLED=true

# Schwellenwerte anpassen
SPAM_SCORE_THRESHOLD=50

# Rate-Limiting
RATE_LIMIT_MAX_REQUESTS=20
RATE_LIMIT_WINDOW_MS=900000
```

### Eigene Spam-Quellen hinzufügen

Bearbeiten Sie `scripts/spam-ip-updater.js`:

```javascript
sources: [
  {
    name: 'Your Custom Source',
    url: 'https://example.com/spam-ips.txt',
    type: 'text',
    parser: 'simple'
  }
]
```

## 🔧 Produktions-Setup

### 1. Authentifizierung für Admin-APIs

```javascript
// Middleware für Admin-Schutz
function requireAuth(req, res, next) {
  const token = req.headers.authorization;
  
  if (!token || token !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}

// Anwenden auf Admin-Routen
app.use('/api/admin', requireAuth);
```

### 2. Persistente Speicherung

Für Produktionsumgebungen sollten Sie die Blacklist in einer Datenbank speichern:

```javascript
// Beispiel mit Redis
const redis = require('redis');
const client = redis.createClient();

async function addToBlacklist(ip, reason) {
  await client.sadd('blocked_ips', ip);
  await client.hset('ip_reasons', ip, reason);
}
```

### 3. Monitoring & Alerting

```javascript
// Slack/Discord Webhook bei neuen Blockierungen
function notifyBlockedIP(ip, reason) {
  // Webhook-Implementierung
}
```

### 4. Cronjob für Updates

```bash
# Täglich um 3:00 Uhr
0 3 * * * cd /path/to/qopy && npm run update-spam-ips
```

## 🚨 Troubleshooting

### Häufige Probleme

1. **Externe Listen laden nicht**
   - Prüfen Sie die Internetverbindung
   - Überprüfen Sie Firewall-Einstellungen
   - Logs ansehen: `journalctl -u qopy -f`

2. **Zu viele False Positives**
   - Spam-Threshold erhöhen: `SPAM_SCORE_THRESHOLD=75`
   - Whitelist für bekannte gute IPs implementieren

3. **Performance-Probleme**
   - IP-Limit reduzieren: `maxIPs: 5000` in spam-ip-updater.js
   - Redis für IP-Speicherung verwenden

### Debug-Modus

```bash
DEBUG=true npm start
```

## 📈 Metriken

Die Anwendung sammelt folgende Metriken:
- Anzahl blockierter Requests
- Spam-Score-Verteilung
- Erfolgsrate der Spam-Erkennung
- Blacklist-Größe und -Quellen

Diese können über `/api/health` abgerufen werden.

## 🔐 Sicherheitshinweise

1. **Admin-APIs schützen**: Niemals ungeschützt in Produktion betreiben
2. **Rate-Limiting**: Zusätzlich zu IP-Blocking implementieren
3. **Logs überwachen**: Regelmäßig auf ungewöhnliche Aktivitäten prüfen
4. **Updates**: Externe Listen regelmäßig aktualisieren
5. **Backup**: Wichtige IPs vor automatischer Blockierung schützen

## 📝 Beispiel-Workflow

1. Server starten: Lädt automatisch externe Spam-Listen
2. Automatische Erkennung: Hohe Spam-Scores führen zur IP-Blockierung
3. Überwachung: Health-Check zeigt aktuelle Statistiken
4. Wartung: Täglich neue Spam-Listen laden
5. Administration: Bei Bedarf manuelle IP-Verwaltung

---

**Tipp**: Starten Sie mit konservativen Einstellungen und justieren Sie basierend auf Ihren Logs nach. 