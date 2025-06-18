# Qopy - Docker Setup

Diese Anwendung wurde für Docker Compose v2 konfiguriert. Hier findest du alle Anweisungen zum Erstellen und Betreiben der App mit Docker.

## Voraussetzungen

- Docker Engine (Version 20.10.0 oder höher)
- Docker Compose v2 (empfohlen)

Prüfe deine Docker-Version:
```bash
docker --version
docker compose version
```

## Schnellstart

### 1. App erstellen und starten
```bash
# Erstelle und starte die App im Hintergrund
docker compose up -d --build

# Oder im Vordergrund (mit Logs)
docker compose up --build
```

### 2. Zugriff auf die App
Die App läuft unter: http://localhost:3000

### 3. App stoppen
```bash
# Stoppe die Container
docker compose down

# Stoppe und entferne Volumes (Achtung: Daten gehen verloren!)
docker compose down -v
```

## Verfügbare Befehle

### Entwicklung
```bash
# App im Development-Modus starten
docker compose up --build

# Logs anzeigen
docker compose logs -f

# Container-Status prüfen
docker compose ps

# In den Container einsteigen
docker compose exec qopy-app sh
```

### Wartung
```bash
# Container neustarten
docker compose restart

# Images aktualisieren
docker compose pull
docker compose up -d --build

# Aufräumen (entfernt gestoppte Container, ungenutzte Netzwerke, etc.)
docker system prune
```

## Konfiguration

### Umgebungsvariablen
Du kannst Umgebungsvariablen in der `docker-compose.yml` anpassen:

```yaml
environment:
  - NODE_ENV=production
  - PORT=3000
```

### Port ändern
Um den Port zu ändern, bearbeite die `docker-compose.yml`:

```yaml
ports:
  - "8080:3000"  # App läuft dann unter localhost:8080
```

### Volumes
Derzeit wird ein Volume für zukünftige persistente Speicherung vorbereitet:

```yaml
volumes:
  - clipboard_data:/app/data
```

## Health Checks

Die App verfügt über automatische Health Checks:
- Interval: 30 Sekunden
- Timeout: 10 Sekunden
- Retries: 3
- Start Period: 40 Sekunden

Status prüfen:
```bash
docker compose ps
```

## Logs

```bash
# Alle Logs anzeigen
docker compose logs

# Logs live verfolgen
docker compose logs -f

# Logs eines bestimmten Services
docker compose logs qopy-app
```

## Troubleshooting

### Container startet nicht
```bash
# Detaillierte Logs anzeigen
docker compose logs qopy-app

# Container-Status prüfen
docker compose ps
```

### Port bereits in Verwendung
Ändere den Port in der `docker-compose.yml`:
```yaml
ports:
  - "3001:3000"  # Verwendet Port 3001 statt 3000
```

### Cache-Probleme
```bash
# Build ohne Cache
docker compose build --no-cache
docker compose up -d
```

## Performance-Optimierungen

- Multi-stage Build für kleinere Images
- Alpine Linux für minimale Größe
- Non-root User für erhöhte Sicherheit
- Optimierte Layer-Caching durch strategische COPY-Befehle

## Sicherheit

- Läuft als non-root User (nextjs:nodejs)
- Minimales Alpine-Base-Image
- Health Checks für Verfügbarkeit
- Proper restart policy 