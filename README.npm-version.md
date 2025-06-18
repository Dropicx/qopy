# 📦 npm Version Requirements für Qopy

## 🎯 Überblick

Qopy benötigt **npm >= 11.4.2** für optimale Performance und Sicherheit. Dieses Dokument erklärt, wie Sie sicherstellen, dass die richtige npm-Version verwendet wird.

## 🔍 Version prüfen

```bash
# Aktuelle npm-Version anzeigen
npm --version

# Qopy npm-Check ausführen
npm run check-npm
```

## ⬆️ npm Version upgraden

### Methode 1: npm selbst upgraden
```bash
# Auf die neueste npm-Version upgraden
npm install -g npm@latest

# Oder auf eine spezifische Version
npm install -g npm@11.4.2
```

### Methode 2: Node.js mit nvm upgraden
```bash
# nvm installieren (falls nicht vorhanden)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Neueste Node.js Version (enthält aktuelle npm)
nvm install node
nvm use node

# npm-Version überprüfen
npm --version
```

### Methode 3: Volta verwenden (empfohlen)
```bash
# Volta installieren
curl https://get.volta.sh | bash

# Node.js und npm über Volta verwalten
volta install node@20.10.0
volta install npm@11.4.2
```

## 🚀 Deployment-Systeme

### Railway.app
Railway lädt automatisch eine aktuelle npm-Version durch:
- `railway.toml` buildCommand führt Version-Check aus
- Nixpacks builder mit Node 20
- Automatische npm-Upgrade im Build-Prozess

### Docker
Das Dockerfile upgradet npm automatisch:
```dockerfile
# Upgrade npm to latest version
RUN npm install -g npm@latest
```

### GitHub Actions / CI/CD
Beispiel-Konfiguration für Actions:
```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'
    
- name: Upgrade npm
  run: npm install -g npm@latest
  
- name: Verify npm version
  run: npm run check-npm
```

## 🛠️ Automatische Checks

Qopy führt automatisch npm-Version-Checks aus:

1. **preinstall**: Vor jeder `npm install`
2. **build**: Während des Build-Prozesses  
3. **check-npm**: Manueller Check-Befehl

## ⚙️ Konfigurationsdateien

### `.npmrc`
```ini
# npm configuration for Qopy
engine-strict=true
prefer-online=true
fund=false
audit=false
legacy-peer-deps=false
```

### `package.json` engines
```json
{
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=11.4.2"
  }
}
```

### `.nvmrc`
```
20.10.0
```

## 🔧 Troubleshooting

### Problem: "npm version X.X.X is too old"
**Lösung**: npm upgraden (siehe Methoden oben)

### Problem: Permission Errors bei npm-Upgrade
**Lösung**: 
```bash
# macOS/Linux
sudo npm install -g npm@latest

# Oder Node.js Version Manager verwenden
```

### Problem: Build schlägt auf Railway fehl
**Lösung**: 
- Railway verwendet automatisch Node 20 mit aktueller npm
- Version-Check ist im `railway.toml` buildCommand integriert
- Logs überprüfen für detaillierte Fehlermeldungen

### Problem: Docker Build schlägt fehl
**Lösung**:
- Dockerfile führt automatisches npm-Upgrade durch
- Prüfen Sie die Docker-Logs für Details
- Rebuild mit `--no-cache` für sauberen Build

## 📋 Checkliste für Deployment

- [ ] Lokale npm-Version >= 11.4.2
- [ ] `npm run check-npm` läuft erfolgreich
- [ ] Alle Dependencies installiert mit `npm ci`
- [ ] Tests laufen durch
- [ ] Build-Prozess erfolgreich

## 🎯 Warum npm >= 11.4.2?

- **Performance**: Deutlich schnellere Installations- und Build-Zeiten
- **Sicherheit**: Aktuelle Security-Patches und Vulnerability-Checks
- **Features**: Bessere Workspace-Unterstützung und Lock-File-Handling
- **Compatibilität**: Optimierte Kompatibilität mit modernen Node.js-Versionen
- **Dependency Resolution**: Verbesserte Algorithmen für Package-Auflösung

---

💡 **Tipp**: Verwenden Sie `volta` oder `nvm` für automatisches Node.js/npm-Versionsmanagement in verschiedenen Projekten. 