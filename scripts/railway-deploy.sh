#!/bin/sh

# Railway Deployment Script für Qopy  
# Dieses Skript wird automatisch bei Railway-Deployments ausgeführt
# Kompatibel mit Alpine Linux (sh)

set -e

echo "🚀 Railway Deployment für Qopy gestartet..."

# Überprüfe ob wir in einer Railway-Umgebung sind
if [ -n "$RAILWAY_ENVIRONMENT" ]; then
    echo "✅ Railway-Umgebung erkannt: $RAILWAY_ENVIRONMENT"
else
    echo "⚠️ Warnung: Nicht in Railway-Umgebung"
fi

# Erstelle notwendige Verzeichnisse
echo "📁 Erstelle Verzeichnisse..."
mkdir -p data logs temp

# Admin-Setup ausführen (falls nicht bereits geschehen)
if [ ! -f "ADMIN-QUICKSTART.md" ]; then
    echo "🎛️ Führe Admin-Setup aus..."
    npm run setup-admin
else
    echo "✅ Admin bereits eingerichtet"
fi

# Spam-IP-Listen aktualisieren
echo "📥 Aktualisiere Spam-IP-Listen..."
if npm run update-spam-ips; then
    echo "✅ Spam-IP-Listen erfolgreich aktualisiert"
    
    # Zeige Statistiken
    if [ -f "data/spam-ips.json" ]; then
        SPAM_COUNT=$(node -e "
            try {
                const data = require('./data/spam-ips.json');
                console.log(data.totalIPs || 0);
            } catch(e) {
                console.log('0');
            }
        ")
        echo "📊 $SPAM_COUNT Spam-IPs geladen"
    fi
else
    echo "⚠️ Warnung: Spam-IP-Listen konnten nicht aktualisiert werden"
    echo "   Das ist normal beim ersten Deployment oder bei Netzwerkproblemen"
fi

# Zeige Railway-spezifische Informationen
echo ""
echo "🎯 Railway Deployment Informationen:"
echo "   - Environment: ${RAILWAY_ENVIRONMENT:-'unbekannt'}"
echo "   - Service: ${RAILWAY_SERVICE_NAME:-'qopy'}"
echo "   - Region: ${RAILWAY_REGION:-'unbekannt'}"

if [ -n "$RAILWAY_PUBLIC_DOMAIN" ]; then
    echo "   - Public URL: https://$RAILWAY_PUBLIC_DOMAIN"
    echo "   - Admin Dashboard: https://$RAILWAY_PUBLIC_DOMAIN/admin"
else
    echo "   - Public URL: wird nach Deployment verfügbar sein"
fi

# Admin-Token-Information
if [ -n "$ADMIN_TOKEN" ]; then
    echo "   - Admin-Token: ✅ gesetzt"
else
    echo "   - Admin-Token: ⚠️ nicht gesetzt (verwende Standard-Token)"
fi

# Umgebungsvariablen prüfen
echo ""
echo "🔧 Umgebungsvariablen-Status:"
echo "   - NODE_ENV: ${NODE_ENV:-'nicht gesetzt'}"
echo "   - SPAM_FILTER_ENABLED: ${SPAM_FILTER_ENABLED:-'standard (true)'}"
echo "   - SPAM_SCORE_THRESHOLD: ${SPAM_SCORE_THRESHOLD:-'standard (50)'}"
echo "   - RATE_LIMIT_MAX_REQUESTS: ${RATE_LIMIT_MAX_REQUESTS:-'standard (20)'}"

# Dateiberechtigungen setzen
echo ""
echo "🔐 Setze Dateiberechtigungen..."
chmod -R 755 scripts/
chmod -R 755 data/ logs/ temp/ 2>/dev/null || true

# Zeige finale Informationen
echo ""
echo "✅ Railway Deployment erfolgreich abgeschlossen!"
echo ""
echo "📋 Nächste Schritte:"
echo "   1. Warten Sie, bis das Deployment vollständig ist"
echo "   2. Besuchen Sie https://\$RAILWAY_PUBLIC_DOMAIN/admin"
echo "   3. Loggen Sie sich mit Ihrem Admin-Token ein"
echo "   4. Überprüfen Sie die Spam-Filter-Statistiken"
echo ""
echo "🔗 Nützliche Links:"
echo "   - Health Check: https://\$RAILWAY_PUBLIC_DOMAIN/api/health"
echo "   - Main App: https://\$RAILWAY_PUBLIC_DOMAIN"
echo "   - Admin Dashboard: https://\$RAILWAY_PUBLIC_DOMAIN/admin"
echo ""

# Warte kurz, damit die Logs sichtbar sind
sleep 2

exit 0 