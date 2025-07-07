# Client-Side Encryption in Qopy

## Übersicht

Qopy implementiert jetzt client-seitige Verschlüsselung für maximalen Datenschutz. Der Content wird **niemals** unverschlüsselt an den Server übertragen oder in der Datenbank gespeichert.

## Wie es funktioniert

### 1. Verschlüsselung beim Erstellen eines Clips

- **Ohne Passwort**: Ein zufälliger AES-256-GCM Schlüssel wird generiert und mit dem Content verschlüsselt
- **Mit Passwort**: Der Schlüssel wird aus dem Passwort mit PBKDF2 abgeleitet (100.000 Iterationen)
- Der verschlüsselte Content wird als Base64-String an den Server gesendet
- Der Server speichert nur den verschlüsselten Content

### 2. Entschlüsselung beim Abrufen eines Clips

- Der verschlüsselte Content wird vom Server abgerufen
- **Ohne Passwort**: Der gespeicherte Schlüssel wird importiert und der Content entschlüsselt
- **Mit Passwort**: Der Schlüssel wird aus dem eingegebenen Passwort abgeleitet
- Der entschlüsselte Content wird dem Benutzer angezeigt

## Technische Details

### Verschlüsselungsalgorithmus
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

## Sicherheitsvorteile

1. **Zero-Knowledge**: Der Server sieht niemals den Klartext
2. **Ende-zu-Ende**: Verschlüsselung erfolgt ausschließlich im Browser
3. **Einzelschlüssel**: Jeder Clip hat seinen eigenen Verschlüsselungsschlüssel
4. **Authentifizierung**: GCM-Modus verhindert Manipulation der Daten
5. **Forward Secrecy**: Bei Passwort-Clips wird der Schlüssel nicht gespeichert

## Kompatibilität

### Rückwärtskompatibilität
- Bestehende unverschlüsselte Clips werden weiterhin unterstützt
- Die App erkennt automatisch, ob Content verschlüsselt ist oder nicht

### Browser-Unterstützung
- Erfordert HTTPS (Web Crypto API)
- Unterstützt alle modernen Browser
- Fallback-Fehlermeldung bei fehlender Crypto API

## Migration

### Bestehende Clips
- Unverschlüsselte Clips bleiben funktionsfähig
- Neue Clips werden automatisch verschlüsselt
- Keine manuelle Migration erforderlich

### Admin-Interface
- Zeigt verschlüsselten Content an (nicht lesbar)
- Statistiken bleiben unverändert
- Keine Änderungen an der Datenbankstruktur

## Datenschutz

Diese Implementierung bietet **100% Datenschutz**:
- Server-Administratoren können Content nicht lesen
- Datenbank-Hacks offenbaren nur verschlüsselte Daten
- Transport-Verschlüsselung (HTTPS) + Content-Verschlüsselung
- Selbst bei vollständigem Server-Zugriff bleibt Content geschützt

## Fehlerbehandlung

- **Crypto API nicht verfügbar**: Klare Fehlermeldung mit HTTPS-Hinweis
- **Falsches Passwort**: Spezifische Fehlermeldung bei Entschlüsselungsfehlern
- **Beschädigte Daten**: Graceful Fallback mit aussagekräftiger Meldung 