# Qopy - Secure Temporary Text Sharing

A modern, secure, and anonymous text sharing application that allows you to share content temporarily without registration. Your content is automatically deleted after a specified period, ensuring privacy and security.

## 🌟 Features

- **🔒 Client-Side Encryption**: Content is encrypted in your browser before being sent to our servers
- **🛡️ Zero-Knowledge**: We never see your plain text content - only encrypted data
- **⏰ Auto-Expiration**: Content is automatically deleted after your chosen time (5min - 24hr)
- **🔐 Password Protection**: Optional password protection with PBKDF2 key derivation
- **🔥 One-Time Access**: Content can self-destruct after the first read
- **📱 QR Code Generation**: Easy mobile sharing with generated QR codes
- **🌐 Modern UI**: Beautiful, responsive interface with typing animations
- **🚀 Fast & Reliable**: Built with Node.js, Express, and PostgreSQL
- **🔗 Direct URLs**: Share clips with simple 6-character IDs
- **📱 Mobile Optimized**: Responsive design with touch-friendly interface
- **🔐 Admin Dashboard**: Real-time monitoring and analytics

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database (Railway PostgreSQL plugin)
- Railway account (for deployment)

### Local Development
```bash
# Clone the repository
git clone https://github.com/yourusername/qopy.git
cd qopy

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database URL

# Start development server
npm run dev
```

### Production Deployment (Railway)
```bash
# Deploy to Railway
railway up

# Check deployment status
railway status

# View logs
railway logs
```

## 📁 Project Structure

```
qopy/
├── public/                 # Frontend assets
│   ├── index.html         # Main application
│   ├── script.js          # Frontend JavaScript
│   ├── styles.css         # Styling
│   ├── admin.html         # Admin dashboard
│   ├── legal.html         # Legal pages
│   ├── privacy.html       # Privacy policy
│   ├── terms.html         # Terms of service
│   └── logos/             # Images and favicon
├── scripts/               # Utility scripts
│   ├── db-init.js         # Database initialization
│   ├── test.js            # Deployment tests
│   ├── monitor.js         # Production monitoring
│   ├── health.js          # Health check utility
│   ├── db-check.js        # Database connection test
│   └── migrate-passwords.js # Password migration
├── server.js              # Main server (production)
├── railway.toml           # Railway configuration
├── Dockerfile             # Railway Dockerfile
└── package.json           # Dependencies and scripts
```

## 🔧 Configuration

### Environment Variables
```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:port/db
PORT=3000
```

### Railway Configuration
The app is configured for Railway deployment with:
- PostgreSQL database plugin
- Automatic health checks
- Production-optimized settings
- No healthcheck configuration for faster startup

## 📊 API Endpoints

### Health & Status
- `GET /health` - Health check with uptime and version
- `GET /ping` - Simple ping response
- `GET /api/health` - API health check

### Core Functionality
- `POST /api/share` - Create a new clip
  ```json
  {
    "content": "Your text content",
    "expiration": "5min|15min|30min|1hr|6hr|24hr",
    "password": "optional_password",
    "oneTime": false
  }
  ```
- `GET /api/clip/:id` - Retrieve a clip (no password)
- `POST /api/clip/:id` - Retrieve a password-protected clip
  ```json
  {
    "password": "your_password"
  }
  ```
- `GET /api/clip/:id/info` - Get clip info (expiration, password status)

### Admin Endpoints
- `GET /api/admin/stats` - System statistics
- `GET /api/admin/clips` - Recent clips list
- `GET /api/admin/system` - System information

### Admin Dashboard
- `GET /admin` - Admin dashboard interface
- **Access**: https://qopy.app/admin
- **Password**: `qopy2024` (demo password)

### Static Files
- `GET /` - Main application
- `GET /clip/:id` - Direct clip access (auto-redirects to retrieve)
- `GET /favicon.ico` - Favicon
- `GET /apple-touch-icon.png` - Apple touch icon

## 🛠️ Development

### Available Scripts
```bash
npm start                    # Start production server
npm run dev                  # Start development server
npm run test                 # Test deployment functionality
npm run monitor              # Monitor production health
npm run db:check             # Check database connection
npm run db:init              # Initialize PostgreSQL database
npm run db:migrate-passwords # Run password migration
```

### Testing
```bash
# Test deployment
npm run test

# Monitor production
npm run monitor

# Manual API testing
curl https://qopy.app/health
curl -X POST https://qopy.app/api/share \
  -H "Content-Type: application/json" \
  -d '{"content":"Test","expiration":"5min"}'
```

## 🎯 Frontend Features

### Share Tab
- **Content input**: Up to 100,000 characters with real-time counter
- **Expiration options**: 5min, 15min, 30min, 1hr, 6hr, 24hr
- **Security options**: Password protection, one-time access
- **QR code generation**: Automatic QR code for mobile sharing
- **Copy functions**: Easy copying of URLs and clip IDs

### Retrieve Tab
- **Clip ID input**: 6-character ID with auto-uppercase
- **Password support**: Automatic password field detection
- **Auto-retrieval**: Direct URLs automatically retrieve content
- **Content display**: Formatted content with metadata
- **Copy content**: One-click content copying

### URL Routing
- **Direct access**: `/clip/ABC123` automatically switches to retrieve tab
- **Auto-fill**: Clip ID is automatically filled in
- **Auto-retrieve**: Content is automatically retrieved
- **Password detection**: Password field shown if needed

### User Experience
- **Typing animation**: Animated logo with typing effect
- **Tab navigation**: Smooth tab switching with keyboard shortcuts
- **Toast notifications**: Success and error messages
- **Loading states**: Visual feedback during operations
- **Responsive design**: Works on all device sizes

## 🔒 Security Features

### Client-Side Encryption
- **🔐 Client-side encryption**: All content is encrypted with AES-256-GCM in your browser before transmission
- **🛡️ Zero-knowledge architecture**: We never see your plain text content - only encrypted data
- **🔑 Advanced key management**:
  - Random keys for non-password clips (stored with content)
  - PBKDF2-derived keys for password-protected clips (100,000 iterations)
- **Temporary database storage**: Encrypted content stored in PostgreSQL with automatic cleanup
- **No user accounts**: Completely anonymous usage
- **No content logging**: We never analyze or mine your text data
- **Guaranteed deletion**: Content is automatically deleted after expiration

### Encryption Details
- **Algorithm**: AES-256-GCM
- **Key length**: 256 bits
- **IV**: 12 bytes (randomly generated)
- **Authentication**: Integrated in GCM mode

### Key Derivation (for password clips)
- **Algorithm**: PBKDF2
- **Hash**: SHA-256
- **Iterations**: 100,000
- **Salt**: "qopy-salt-v1" (fixed)

### Data Format
```json
{
  "iv": [12 bytes],
  "data": [encrypted content],
  "key": [32 bytes, only for non-password clips]
}
```

## 🚦 Rate Limiting

Qopy implements a multi-layered IP-based rate limiting system:

### Rate Limiting Levels
1. **Burst protection (1-minute window)**: 30 requests per IP per minute
2. **General API protection (15-minute window)**: 100 requests per IP per 15 minutes
3. **Share API protection (15-minute window)**: 20 share requests per IP per 15 minutes
4. **Retrieval API protection (15-minute window)**: 50 retrieval requests per IP per 15 minutes

### Exempt Endpoints
- `/health` - Health checks
- `/api/health` - API health checks
- `/ping` - Simple ping
- `/api/admin/*` - Admin endpoints (protected by authentication)

### Rate Limit Responses
```json
{
  "error": "Too many requests",
  "message": "Rate limit exceeded. Please try again later."
}
```

## 🔐 Password Migration

Qopy has been updated to use secure bcrypt password hashing instead of storing passwords in plaintext:

### What Changed
- **Before (insecure)**: Passwords stored as plaintext in the database
- **After (secure)**: Passwords hashed with bcrypt (12 salt rounds)

### Migration Process
The migration runs automatically when the application starts:
1. Database initialization (`db-init.js`)
2. **Password migration (`migrate-passwords.js`)**
3. Application startup (`server.js`)

### Manual Migration
```bash
npm run db:migrate-passwords
```

### Migration Safety
- ✅ **Non-destructive**: Original data preserved
- ✅ **Idempotent**: Can be run multiple times safely
- ✅ **Backward compatible**: Supports both old and new formats during transition
- ✅ **Error handling**: Continues on individual failures

## 📊 Monitoring & Logging

### Share Request Logging
```
📋 Share request from 192.168.1.100 - Mozilla/5.0 (Windows NT 10.0; Win64; x64)
```

### Rate Limit Hit Logging
```
🚫 Rate limit hit by 192.168.1.100 on /api/share - Mozilla/5.0 (Windows NT 10.0; Win64; x64)
```

### Suspicious Pattern Detection
- High-frequency share requests
- Unusual user-agent patterns
- Multiple rate limit violations

## 🔧 Troubleshooting

### Common Issues

1. **Rate limiting too aggressive**
   - Check if you're making too many requests
   - Wait for the time window to reset
   - Consider implementing client-side rate limiting

2. **IP detection issues**
   - Verify trust proxy settings
   - Check Railway configuration
   - Review logs for IP detection

3. **Admin access blocked**
   - Admin endpoints are exempt from rate limiting
   - Check authentication instead
   - Verify ADMIN_TOKEN environment variable

### Debugging
```bash
# Check current rate limit status
curl -I https://qopy.app/api/share

# Response headers show limits:
# X-RateLimit-Limit: 20
# X-RateLimit-Remaining: 19
# X-RateLimit-Reset: 1640995200
```

## 🚀 Deployment

### Railway Deployment
1. **Create project**: Create a new Railway project
2. **Add PostgreSQL**: Install the PostgreSQL plugin
3. **Deploy code**: Connect the repository to Railway
4. **Set environment variables**: DATABASE_URL is set automatically
5. **Configure domain**: Set up a custom domain

### Docker Deployment
```bash
# Build Docker image
docker build -t qopy .

# Start container
docker run -p 3000:3000 -e DATABASE_URL=your_db_url qopy
```

## 📄 Legal Information

- **Privacy Policy**: [privacy.html](public/privacy.html)
- **Terms of Service**: [terms.html](public/terms.html)
- **Imprint**: [legal.html](public/legal.html)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

If you have problems or questions:
1. Check the application logs
2. Test the database connection
3. Run the manual scripts
4. Contact support with specific error messages

---

**Qopy** - Secure, temporary text sharing application for maximum privacy and security.


# Qopy - Secure Temporary Text Sharing

Eine moderne, sichere und anonyme Text-Sharing-Anwendung, die es ermöglicht, Inhalte temporär zu teilen, ohne sich registrieren zu müssen. Ihre Inhalte werden automatisch nach einer bestimmten Zeit gelöscht, um Privatsphäre und Sicherheit zu gewährleisten.

## 🌟 Features

- **🔒 Client-Side Encryption**: Inhalte werden in Ihrem Browser verschlüsselt, bevor sie an unsere Server gesendet werden
- **🛡️ Zero-Knowledge**: Wir sehen niemals Ihren Klartext-Inhalt - nur verschlüsselte Daten
- **⏰ Auto-Expiration**: Inhalte werden automatisch nach Ihrer gewählten Zeit gelöscht (5min - 24hr)
- **🔐 Passwortschutz**: Optionaler Passwortschutz mit PBKDF2-Schlüsselableitung
- **🔥 Einmaliger Zugriff**: Inhalte können sich nach dem ersten Lesen selbst zerstören
- **📱 QR-Code-Generierung**: Einfaches mobiles Teilen mit generierten QR-Codes
- **🌐 Moderne UI**: Schöne, responsive Benutzeroberfläche mit Tipp-Animationen
- **🚀 Schnell & Zuverlässig**: Gebaut mit Node.js, Express und PostgreSQL
- **🔗 Direkte URLs**: Teilen Sie Clips mit einfachen 6-Zeichen-IDs
- **📱 Mobile Optimiert**: Responsive Design mit touch-freundlicher Oberfläche
- **🔐 Admin Dashboard**: Echtzeit-Monitoring und Analytics

## 🚀 Quick Start

### Voraussetzungen
- Node.js 18+ 
- PostgreSQL-Datenbank (Railway PostgreSQL Plugin)
- Railway-Account (für Deployment)

### Lokale Entwicklung
```bash
# Repository klonen
git clone https://github.com/yourusername/qopy.git
cd qopy

# Abhängigkeiten installieren
npm install

# Umgebungsvariablen einrichten
cp .env.example .env
# .env mit Ihrer Datenbank-URL bearbeiten

# Entwicklungsserver starten
npm run dev
```

### Produktions-Deployment (Railway)
```bash
# Auf Railway deployen
railway up

# Deployment-Status prüfen
railway status

# Logs anzeigen
railway logs
```

## 📁 Projektstruktur

```
qopy/
├── public/                 # Frontend-Assets
│   ├── index.html         # Hauptanwendung
│   ├── script.js          # Frontend JavaScript
│   ├── styles.css         # Styling
│   ├── admin.html         # Admin Dashboard
│   ├── legal.html         # Rechtliche Seiten
│   ├── privacy.html       # Datenschutz
│   ├── terms.html         # Nutzungsbedingungen
│   └── logos/             # Bilder und Favicon
├── scripts/               # Utility-Skripte
│   ├── db-init.js         # Datenbank-Initialisierung
│   ├── test.js            # Deployment-Tests
│   ├── monitor.js         # Produktions-Monitoring
│   ├── health.js          # Health-Check-Utility
│   ├── db-check.js        # Datenbank-Verbindungstest
│   └── migrate-passwords.js # Passwort-Migration
├── server.js              # Hauptserver (Produktion)
├── railway.toml           # Railway-Konfiguration
├── Dockerfile             # Railway Dockerfile
└── package.json           # Abhängigkeiten und Skripte
```

## 🔧 Konfiguration

### Umgebungsvariablen
```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:port/db
PORT=3000
```

### Railway-Konfiguration
Die App ist für Railway-Deployment konfiguriert mit:
- PostgreSQL-Datenbank-Plugin
- Automatische Health-Checks
- Produktions-optimierte Einstellungen
- Keine Healthcheck-Konfiguration für schnelleren Start

## 📊 API-Endpunkte

### Health & Status
- `GET /health` - Health-Check mit Uptime und Version
- `GET /ping` - Einfache Ping-Antwort
- `GET /api/health` - API-Health-Check

### Kern-Funktionalität
- `POST /api/share` - Neuen Clip erstellen
  ```json
  {
    "content": "Ihr Textinhalt",
    "expiration": "5min|15min|30min|1hr|6hr|24hr",
    "password": "optionales_passwort",
    "oneTime": false
  }
  ```
- `GET /api/clip/:id` - Clip abrufen (ohne Passwort)
- `POST /api/clip/:id` - Passwort-geschützten Clip abrufen
  ```json
  {
    "password": "ihr_passwort"
  }
  ```
- `GET /api/clip/:id/info` - Clip-Info abrufen (Ablaufzeit, Passwort-Status)

### Admin-Endpunkte
- `GET /api/admin/stats` - System-Statistiken
- `GET /api/admin/clips` - Liste der letzten Clips
- `GET /api/admin/system` - System-Informationen

### Admin Dashboard
- `GET /admin` - Admin Dashboard Interface
- **Zugriff**: https://qopy.app/admin
- **Passwort**: `qopy2024` (Demo-Passwort)

### Statische Dateien
- `GET /` - Hauptanwendung
- `GET /clip/:id` - Direkter Clip-Zugriff (auto-redirects zu retrieve)
- `GET /favicon.ico` - Favicon
- `GET /apple-touch-icon.png` - Apple Touch Icon

## 🛠️ Entwicklung

### Verfügbare Skripte
```bash
npm start                    # Produktionsserver starten
npm run dev                  # Entwicklungsserver starten
npm run test                 # Deployment-Funktionalität testen
npm run monitor              # Produktions-Health überwachen
npm run db:check             # Datenbank-Verbindung prüfen
npm run db:init              # PostgreSQL-Datenbank initialisieren
npm run db:migrate-passwords # Passwort-Migration ausführen
```

### Testing
```bash
# Deployment testen
npm run test

# Produktion überwachen
npm run monitor

# Manuelle API-Tests
curl https://qopy.app/health
curl -X POST https://qopy.app/api/share \
  -H "Content-Type: application/json" \
  -d '{"content":"Test","expiration":"5min"}'
```

## 🎯 Frontend-Features

### Share Tab
- **Inhaltseingabe**: Bis zu 100.000 Zeichen mit Echtzeit-Zähler
- **Ablaufoptionen**: 5min, 15min, 30min, 1hr, 6hr, 24hr
- **Sicherheitsoptionen**: Passwortschutz, einmaliger Zugriff
- **QR-Code-Generierung**: Automatischer QR-Code für mobiles Teilen
- **Kopier-Funktionen**: Einfaches Kopieren von URLs und Clip-IDs

### Retrieve Tab
- **Clip-ID-Eingabe**: 6-Zeichen-ID mit Auto-Großschreibung
- **Passwort-Unterstützung**: Automatische Passwort-Feld-Erkennung
- **Auto-Retrieval**: Direkte URLs rufen automatisch Inhalte ab
- **Inhaltsanzeige**: Formatierte Inhalte mit Metadaten
- **Inhalt kopieren**: Ein-Klick-Inhaltskopierung

### URL-Routing
- **Direkter Zugriff**: `/clip/ABC123` wechselt automatisch zum Retrieve-Tab
- **Auto-Ausfüllen**: Clip-ID wird automatisch ausgefüllt
- **Auto-Retrieval**: Inhalt wird automatisch abgerufen
- **Passwort-Erkennung**: Passwort-Feld wird bei Bedarf angezeigt

### Benutzererfahrung
- **Tipp-Animation**: Animiertes Logo mit Tipp-Effekt
- **Tab-Navigation**: Smooth Tab-Wechsel mit Tastenkürzeln
- **Toast-Benachrichtigungen**: Erfolgs- und Fehlermeldungen
- **Lade-Zustände**: Visuelles Feedback während Operationen
- **Responsive Design**: Funktioniert auf allen Gerätegrößen

## 🔒 Sicherheitsfeatures

### Client-Side Encryption
- **🔐 Client-seitige Verschlüsselung**: Alle Inhalte werden mit AES-256-GCM in Ihrem Browser verschlüsselt, bevor sie übertragen werden
- **🛡️ Zero-Knowledge-Architektur**: Wir sehen niemals Ihren Klartext-Inhalt - nur verschlüsselte Daten
- **🔑 Erweiterte Schlüsselverwaltung**: 
  - Zufällige Schlüssel für nicht-Passwort-Clips (mit Inhalt gespeichert)
  - PBKDF2-abgeleitete Schlüssel für Passwort-geschützte Clips (100.000 Iterationen)
- **Temporäre Datenbankspeicherung**: Verschüsselter Inhalt wird in PostgreSQL mit automatischer Bereinigung gespeichert
- **Keine Benutzerkonten**: Komplett anonyme Nutzung
- **Keine Inhaltsprotokollierung**: Wir analysieren oder minen niemals Ihre Textdaten
- **Garantierte Löschung**: Inhalte werden automatisch nach Ablauf gelöscht

### Verschlüsselungsdetails
- **Algorithmus**: AES-256-GCM
- **Schlüssellänge**: 256 Bit
- **IV**: 12 Bytes (zufällig generiert)
- **Authentifizierung**: Integriert in GCM-Modus

### Schlüsselableitung (bei Passwort-Clips)
- **Algorithmus**: PBKDF2
- **Hash**: SHA-256
- **Iterationen**: 100.000
- **Salt**: "qopy-salt-v1" (fest)

### Datenformat
```json
{
  "iv": [12 bytes],
  "data": [encrypted content],
  "key": [32 bytes, nur bei nicht-Passwort-Clips]
}
```

## 🚦 Rate Limiting

Qopy implementiert ein mehrschichtiges IP-basiertes Rate-Limiting-System:

### Rate Limiting Ebenen
1. **Burst-Schutz (1-Minuten-Fenster)**: 30 Anfragen pro IP pro Minute
2. **Allgemeiner API-Schutz (15-Minuten-Fenster)**: 100 Anfragen pro IP pro 15 Minuten
3. **Share-API-Schutz (15-Minuten-Fenster)**: 20 Share-Anfragen pro IP pro 15 Minuten
4. **Retrieval-API-Schutz (15-Minuten-Fenster)**: 50 Retrieval-Anfragen pro IP pro 15 Minuten

### Ausgenommene Endpunkte
- `/health` - Health-Checks
- `/api/health` - API-Health-Checks
- `/ping` - Einfacher Ping
- `/api/admin/*` - Admin-Endpunkte (durch Authentifizierung geschützt)

### Rate Limit Antworten
```json
{
  "error": "Too many requests",
  "message": "Rate limit exceeded. Please try again later."
}
```

## 🔐 Passwort-Migration

Qopy wurde aktualisiert, um sicheres bcrypt-Passwort-Hashing anstelle von Klartext-Passwörtern zu verwenden:

### Was sich geändert hat
- **Vorher (unsicher)**: Passwörter als Klartext in Datenbank gespeichert
- **Nachher (sicher)**: Passwörter mit bcrypt gehasht (Salt-Runden: 12)

### Migration-Prozess
Die Migration läuft automatisch beim Anwendungsstart:
1. Datenbank-Initialisierung (`db-init.js`)
2. **Passwort-Migration (`migrate-passwords.js`)**
3. Anwendungsstart (`server.js`)

### Manuelle Migration
```bash
npm run db:migrate-passwords
```

### Migrationssicherheit
- ✅ **Nicht-destruktiv**: Originaldaten bleiben erhalten
- ✅ **Idempotent**: Kann mehrfach sicher ausgeführt werden
- ✅ **Rückwärtskompatibel**: Unterstützt alte und neue Formate während der Übergangszeit
- ✅ **Fehlerbehandlung**: Fährt bei einzelnen Fehlern fort

## 📊 Monitoring & Logging

### Share-Request-Logging
```
📋 Share request from 192.168.1.100 - Mozilla/5.0 (Windows NT 10.0; Win64; x64)
```

### Rate-Limit-Hit-Logging
```
🚫 Rate limit hit by 192.168.1.100 on /api/share - Mozilla/5.0 (Windows NT 10.0; Win64; x64)
```

### Verdächtige Muster-Erkennung
- Hochfrequente Share-Anfragen
- Ungewöhnliche User-Agent-Muster
- Mehrfache Rate-Limit-Verstöße

## 🔧 Troubleshooting

### Häufige Probleme

1. **Rate Limiting zu aggressiv**
   - Prüfen Sie, ob Sie zu viele Anfragen machen
   - Warten Sie, bis das Zeitfenster zurückgesetzt wird
   - Implementieren Sie client-seitiges Rate Limiting

2. **IP-Erkennungsprobleme**
   - Trust-Proxy-Einstellungen überprüfen
   - Railway-Konfiguration prüfen
   - Logs für IP-Erkennung überprüfen

3. **Admin-Zugriff blockiert**
   - Admin-Endpunkte sind von Rate Limiting ausgenommen
   - Authentifizierung stattdessen prüfen
   - ADMIN_TOKEN-Umgebungsvariable überprüfen

### Debugging
```bash
# Aktuellen Rate-Limit-Status prüfen
curl -I https://qopy.app/api/share

# Antwort-Header zeigen Limits:
# X-RateLimit-Limit: 20
# X-RateLimit-Remaining: 19
# X-RateLimit-Reset: 1640995200
```

## 🚀 Deployment

### Railway Deployment
1. **Projekt erstellen**: Neues Railway-Projekt erstellen
2. **PostgreSQL hinzufügen**: PostgreSQL-Plugin installieren
3. **Code deployen**: Repository mit Railway verbinden
4. **Umgebungsvariablen setzen**: DATABASE_URL automatisch gesetzt
5. **Domain konfigurieren**: Benutzerdefinierte Domain einrichten

### Docker Deployment
```bash
# Docker Image bauen
docker build -t qopy .

# Container starten
docker run -p 3000:3000 -e DATABASE_URL=your_db_url qopy
```

## 📄 Rechtliche Informationen

- **Datenschutz**: [privacy.html](public/privacy.html)
- **Nutzungsbedingungen**: [terms.html](public/terms.html)
- **Impressum**: [legal.html](public/legal.html)

## 🤝 Beitragen

1. Fork das Repository
2. Erstellen Sie einen Feature-Branch (`git checkout -b feature/AmazingFeature`)
3. Committen Sie Ihre Änderungen (`git commit -m 'Add some AmazingFeature'`)
4. Pushen Sie zum Branch (`git push origin feature/AmazingFeature`)
5. Öffnen Sie einen Pull Request

## 📄 Lizenz

Dieses Projekt ist unter der MIT-Lizenz lizenziert - siehe die [LICENSE](LICENSE) Datei für Details.

## 🆘 Support

Bei Problemen oder Fragen:
1. Überprüfen Sie die Anwendungslogs
2. Testen Sie die Datenbankverbindung
3. Führen Sie die manuellen Skripte aus
4. Kontaktieren Sie den Support mit spezifischen Fehlermeldungen

---

**Qopy** - Sichere, temporäre Text-Sharing-Anwendung für maximale Privatsphäre und Sicherheit.