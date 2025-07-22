# 🔐 Qopy Verschlüsselungstest - Anleitung

Diese Anleitung erklärt, wie Sie testen können, ob die Inhalte in Qopy wirklich richtig verschlüsselt werden.

## 📋 Übersicht der Tests

Wir haben drei verschiedene Testmethoden erstellt:

1. **Browser-basierter Test** (`test-encryption.html`) - Testet die client-seitige Verschlüsselung
2. **Serverseitiger Test** (`test-encryption-server.js`) - Testet die Verschlüsselungsalgorithmen
3. **Live-Anwendungstest** (`test-live-encryption.js`) - Testet die laufende Anwendung

## 🧪 Test 1: Browser-basierter Verschlüsselungstest

### Vorbereitung
1. Öffnen Sie die Datei `test-encryption.html` in einem modernen Browser
2. Stellen Sie sicher, dass Sie über HTTPS oder localhost zugreifen (Web Crypto API erfordert sichere Verbindung)

### Durchführung
1. **Einfacher Test:**
   - Geben Sie Testinhalt ein (z.B. "Dies ist ein Test")
   - Klicken Sie auf "🔒 Verschlüsselungstest starten"
   - Überprüfen Sie die Ergebnisse

2. **Umfassender Test:**
   - Klicken Sie auf "🧪 Umfassender Test"
   - Das System führt automatisch 10 verschiedene Testfälle aus

### Was wird getestet?
- ✅ AES-256-GCM Verschlüsselung
- ✅ PBKDF2 Schlüsselableitung (100.000 Iterationen)
- ✅ IV-Ableitung (50.000 Iterationen)
- ✅ Entropie-Analyse der verschlüsselten Daten
- ✅ Verschlüsselung/Entschlüsselung mit und ohne Passwort
- ✅ Verschiedene Zeichentypen (Umlaute, Sonderzeichen, Unicode)

### Erwartete Ergebnisse
- **Entropie:** Verschüsselte Daten sollten eine Entropie > 7.5 bits/byte haben
- **Overhead:** Typischerweise 28-32 Bytes zusätzlich zum Original
- **Format:** IV (12 Bytes) + verschlüsselte Daten
- **Erfolgsrate:** 100% bei korrekter Implementierung

## 🖥️ Test 2: Serverseitiger Verschlüsselungstest

### Vorbereitung
```bash
# Stellen Sie sicher, dass Node.js installiert ist
node --version

# Führen Sie das Testskript aus
node test-encryption-server.js
```

### Durchführung
Das Skript führt automatisch aus:
1. **Umfassende Tests** (10 verschiedene Testfälle)
2. **Sicherheitstests** (5 Sicherheitsprüfungen)
3. **Statistische Analyse**

### Was wird getestet?
- ✅ PBKDF2 Schlüsselableitung
- ✅ AES-256-GCM Verschlüsselung
- ✅ IV-Ableitung
- ✅ Authentifizierte Verschlüsselung
- ✅ Falsche Schlüssel werden abgelehnt
- ✅ Manipulierte Daten werden erkannt
- ✅ Entropie-Analyse

### Erwartete Ergebnisse
```
🔐 Qopy Verschlüsselungstest - Serverseitige Tests

[INFO] Test gestartet: Führe umfassende Verschlüsselungstests aus...
[SUCCESS] Test erfolgreich: Nur URL Secret
[SUCCESS] Test erfolgreich: URL Secret + Passwort
...
[SUCCESS] Sicherheitstest 1: Korrekte Verschlüsselung/Entschlüsselung ✅
[SUCCESS] Sicherheitstest 2: Falsches Passwort korrekt abgelehnt ✅
...

📊 FINALE ZUSAMMENFASSUNG
============================================================
✅ Erfolgreiche Tests: 15/15
📈 Erfolgsrate: 100.0%
📦 Durchschnittlicher Overhead: 28.0 Bytes
🔒 Durchschnittliche Entropie-Verbesserung: 8.2x

🎉 ALLE TESTS ERFOLGREICH! Die Verschlüsselung funktioniert korrekt.
```

## 🌐 Test 3: Live-Anwendungstest

### Vorbereitung
```bash
# Starten Sie die Qopy-Anwendung
node server.js

# In einem anderen Terminal führen Sie den Live-Test aus
node test-live-encryption.js

# Oder testen Sie eine andere URL
node test-live-encryption.js https://qopy.app
```

### Durchführung
Das Skript testet automatisch:
1. **Health Check** - Server-Verfügbarkeit
2. **Web Crypto Simulation** - Client-seitige Verschlüsselung
3. **API Endpoints** - API-Funktionalität
4. **Datenbank-Verschlüsselung** - End-to-End Test
5. **Sicherheitstests** - Rate Limiting, CORS, CSP

### Was wird getestet?
- ✅ Server-Verfügbarkeit
- ✅ API-Endpunkte funktionieren
- ✅ Verschlüsselung in der Praxis
- ✅ Datenbank-Speicherung und -Abruf
- ✅ Rate Limiting
- ✅ Sicherheits-Header

## 🔍 Manuelle Tests

### Test 1: Browser-Entwicklertools
1. Öffnen Sie Qopy in einem Browser
2. Öffnen Sie die Entwicklertools (F12)
3. Gehen Sie zum Network-Tab
4. Erstellen Sie einen neuen Clip
5. Überprüfen Sie die gesendeten Daten:
   - **Erwartet:** Binäre/verschlüsselte Daten (nicht lesbarer Text)
   - **Nicht erwartet:** Klartext-Inhalt

### Test 2: Datenbank-Inspektion
```sql
-- Verbinden Sie sich mit der PostgreSQL-Datenbank
SELECT clip_id, content_type, LENGTH(content) as content_length, 
       LEFT(ENCODE(content, 'hex'), 50) as content_preview
FROM clips 
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

**Erwartete Ergebnisse:**
- `content` sollte BYTEA-Daten enthalten (nicht lesbar)
- `content_preview` sollte zufällige Hex-Zeichen zeigen
- `content_length` sollte größer als der ursprüngliche Text sein

### Test 3: Entropie-Analyse
```javascript
// Im Browser-Konsolenfenster
function calculateEntropy(data) {
    const byteCounts = new Array(256).fill(0);
    for (let i = 0; i < data.length; i++) {
        byteCounts[data[i]]++;
    }
    
    let entropy = 0;
    const totalBytes = data.length;
    
    for (let i = 0; i < 256; i++) {
        if (byteCounts[i] > 0) {
            const probability = byteCounts[i] / totalBytes;
            entropy -= probability * Math.log2(probability);
        }
    }
    
    return entropy;
}

// Testen Sie verschlüsselte Daten
const encryptedData = new Uint8Array([/* Ihre verschlüsselten Daten */]);
console.log('Entropie:', calculateEntropy(encryptedData));
// Erwartet: > 7.5 bits/byte
```

## 📊 Bewertungskriterien

### ✅ Erfolgreiche Verschlüsselung
- **Entropie > 7.5 bits/byte** in verschlüsselten Daten
- **Korrekte Entschlüsselung** mit richtigen Schlüsseln
- **Fehlgeschlagene Entschlüsselung** mit falschen Schlüsseln
- **Overhead von 28-32 Bytes** zusätzlich zum Original
- **IV + verschlüsselte Daten** Format

### ❌ Fehlgeschlagene Verschlüsselung
- **Niedrige Entropie** (< 7.0 bits/byte)
- **Lesbare Daten** in der Datenbank
- **Keine Authentifizierung** bei falschen Schlüsseln
- **Fehlende IV** oder falsches Format

## 🛠️ Fehlerbehebung

### Problem: "Web Crypto API not available"
**Lösung:** Verwenden Sie HTTPS oder localhost

### Problem: "Encryption failed"
**Lösung:** Überprüfen Sie die Eingabedaten und Schlüssel

### Problem: "Server not reachable"
**Lösung:** Stellen Sie sicher, dass der Server läuft

### Problem: "Low entropy in encrypted data"
**Lösung:** Überprüfen Sie die Verschlüsselungsimplementierung

## 📈 Erwartete Statistiken

### Verschlüsselungsleistung
- **Algorithmus:** AES-256-GCM
- **Schlüsselableitung:** PBKDF2 (100.000 Iterationen)
- **IV-Ableitung:** PBKDF2 (50.000 Iterationen)
- **Overhead:** ~28-32 Bytes
- **Entropie:** > 7.5 bits/byte

### Test-Erfolgsraten
- **Browser-Test:** 100%
- **Server-Test:** 100%
- **Live-Test:** 95%+ (abhängig von Netzwerk)

## 🔒 Sicherheitshinweise

1. **Führen Sie Tests nur in einer sicheren Umgebung durch**
2. **Verwenden Sie keine echten Passwörter für Tests**
3. **Löschen Sie Testdaten nach den Tests**
4. **Überprüfen Sie die Ergebnisse sorgfältig**

## 📝 Testprotokoll

Führen Sie diese Tests regelmäßig durch und dokumentieren Sie die Ergebnisse:

```markdown
## Testprotokoll - [DATUM]

### Browser-Test
- [ ] Entropie > 7.5 bits/byte
- [ ] Alle 10 Testfälle erfolgreich
- [ ] Verschlüsselung/Entschlüsselung korrekt

### Server-Test
- [ ] Alle 15 Tests erfolgreich
- [ ] Sicherheitstests bestanden
- [ ] Durchschnittliche Entropie: [WERT]

### Live-Test
- [ ] Server erreichbar
- [ ] API-Endpunkte funktionieren
- [ ] Datenbank-Verschlüsselung korrekt

### Manuelle Tests
- [ ] Browser-Entwicklertools zeigen verschlüsselte Daten
- [ ] Datenbank enthält BYTEA-Daten
- [ ] Entropie-Analyse erfolgreich

**Gesamtbewertung:** ✅ Erfolgreich / ❌ Fehlgeschlagen
```

## 🎯 Fazit

Mit diesen Tests können Sie sicherstellen, dass:

1. **Client-seitige Verschlüsselung** korrekt funktioniert
2. **Server-seitige Verarbeitung** sicher ist
3. **Datenbank-Speicherung** verschlüsselt erfolgt
4. **End-to-End-Sicherheit** gewährleistet ist

Die Tests decken alle wichtigen Aspekte der Qopy-Verschlüsselung ab und geben Ihnen die Gewissheit, dass Ihre Daten wirklich sicher sind. 