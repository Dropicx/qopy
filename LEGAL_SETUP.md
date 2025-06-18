# Rechtliche Seiten Setup für Qopy

Diese Anleitung erklärt, wie Sie die rechtlichen Seiten für Ihre Qopy-Installation anpassen.

## 📋 Übersicht

Qopy enthält bereits vorgefertigte rechtliche Seiten, die den deutschen Gesetzen entsprechen:

- **Impressum** (`/impressum.html`) - § 5 TMG Pflicht
- **Datenschutzerklärung** (`/datenschutz.html`) - DSGVO/GDPR konform
- **AGB** (`/agb.html`) - Nutzungsbedingungen

## ⚠️ WICHTIG: Platzhalter ersetzen

**Bevor Sie Qopy in Produktion nehmen, MÜSSEN Sie folgende Platzhalter in ALLEN drei Dateien ersetzen:**

### Zu ersetzende Platzhalter:

```
[Ihr Name/Firmenname] → Echter Name oder Firmenname
[Straße und Hausnummer] → Ihre Adresse
[PLZ Ort] → Ihre Postleitzahl und Stadt
[Ihre E-Mail-Adresse] → Ihre Kontakt-E-Mail
[Ihre Telefonnummer] → Ihre Telefonnummer (optional)
[Ihr Gerichtsstand] → Zuständiges Gericht (z.B. "München")
```

## 📁 Dateien zum Bearbeiten:

1. `public/impressum.html`
2. `public/datenschutz.html`
3. `public/agb.html`

## 🔍 Suchen und Ersetzen:

### Option 1: Manual
Öffnen Sie jede Datei und ersetzen Sie alle `[...]` Platzhalter mit Ihren echten Daten.

### Option 2: VS Code/Terminal
```bash
# Beispiel für Namensersetzung in allen drei Dateien
sed -i 's/\[Ihr Name\/Firmenname\]/Max Mustermann GmbH/g' public/impressum.html
sed -i 's/\[Ihr Name\/Firmenname\]/Max Mustermann GmbH/g' public/datenschutz.html
sed -i 's/\[Ihr Name\/Firmenname\]/Max Mustermann GmbH/g' public/agb.html

# Wiederholen für alle anderen Platzhalter...
```

## ✅ Checkliste vor Produktionsstart:

- [ ] **Impressum**: Alle Platzhalter ersetzt
- [ ] **Datenschutz**: Alle Platzhalter ersetzt  
- [ ] **AGB**: Alle Platzhalter ersetzt
- [ ] **E-Mail-Adresse** ist erreichbar und wird überwacht
- [ ] **Rechtsberatung** eingeholt (empfohlen)

## 🔗 Footer-Integration

Die rechtlichen Links werden automatisch im Footer aller Seiten angezeigt:
- Hauptseite: `index.html`
- Rechtliche Seiten: Eigene Footer

## 📊 API-Endpoint

Qopy bietet auch einen API-Endpoint für die rechtlichen Seiten:

```
GET /api/legal
```

Antwort:
```json
{
  "impressum": "/impressum.html",
  "datenschutz": "/datenschutz.html", 
  "agb": "/agb.html",
  "updated": "2025-01-01",
  "jurisdiction": "Germany"
}
```

## ⚖️ Rechtliche Hinweise

> **WICHTIG**: Diese Vorlagen sind allgemeine Muster und ersetzen keine professionelle Rechtsberatung. 
> 
> Konsultieren Sie einen Anwalt, um sicherzustellen, dass Ihre rechtlichen Seiten vollständig und aktuell sind.

### Besonderheiten für Qopy:

- **Privacy-First Design**: Qopy speichert keine dauerhaften Daten
- **Automatische Löschung**: Alle Inhalte werden nach Ablaufzeit gelöscht
- **Minimale Datenverarbeitung**: Nur technisch notwendige Daten
- **Open Source**: Transparenter Quellcode

## 🔄 Updates

Überprüfen Sie Ihre rechtlichen Seiten regelmäßig auf:
- Änderungen in der Gesetzgebung
- Updates an Qopy-Features
- Änderungen Ihrer Kontaktdaten

## 📞 Support

Bei Fragen zu den rechtlichen Seiten:
- GitHub Issues für technische Fragen
- Rechtsanwalt für rechtliche Beratung
- Datenschutzbeauftragten für DSGVO-Fragen

---

**Zuletzt aktualisiert**: Januar 2025  
**Qopy Version**: 1.0.0 