# Claude-Helfer für den Mac

**Was er macht:** Du tippst in der App bei einer Aufgabe auf **„An Claude senden“** oder im Kalender auf **„Mit Claude planen → Claude planen lassen“**. Der Helfer auf deinem Mac holt den Auftrag über Firebase ab, lässt Claude Code laufen (über dein Claude-Abo, keine API-Kosten) und schreibt das Ergebnis zurück:
- **Aufgabe:** Ergebnis landet in den Notizen der Aufgabe, Status geht von „Wartet“ auf „Offen“.
- **Wochenplanung:** Der Plan wird automatisch in den Kalender übernommen (mit „Rückgängig“).

Das funktioniert auch vom iPhone aus, solange der Helfer auf dem Mac läuft.

**Sicherheit:** Claude darf hier nur im Web suchen und lesen. Befehle ausführen und Dateien ändern ist gesperrt. Dein Passwort liegt nur lokal in `~/.tasks-helper.json`. Für Apple Mail liegt das iCloud-Passwort im macOS-Schlüsselbund.

---

## Einmalig einrichten (ca. 15 Min)

### 1. Node.js installieren
1. [nodejs.org](https://nodejs.org) öffnen → **LTS**-Version herunterladen → Installer durchklicken.
2. Prüfen: Terminal öffnen (⌘ + Leertaste → „Terminal“) und eingeben:
   ```
   node -v
   ```
   Es sollte eine Zahl wie `v24.x.x` erscheinen.

### 2. Claude Code installieren und anmelden
1. Im Terminal:
   ```
   curl -fsSL https://claude.ai/install.sh | bash
   ```
   (Falls sich der Befehl geändert hat: aktuelle Anleitung auf [claude.com/claude-code](https://claude.com/claude-code).)
2. Terminal schließen und neu öffnen, dann `claude` eingeben und mit deinem Claude-Konto anmelden (Abo, nicht API).
3. Mit `/exit` wieder raus.

### 3. App-Ordner auf den Mac holen
1. [github.com/salkinsuirelav/tasks](https://github.com/salkinsuirelav/tasks) öffnen.
2. Grüner Button **Code → Download ZIP**.
3. ZIP entpacken und den Ordner `tasks-main` z. B. nach **Dokumente** verschieben.

> Wichtig: Den ganzen Ordner entpacken, nicht nur `helper/`. Der Installer braucht `js/config.js`.

### 4. Installieren (Doppelklick)
1. Im Finder den Ordner `tasks-main/helper` öffnen.
2. **`install.command` doppelklicken.**
   - Kommt **„install.command Not Opened / Apple could not verify…“**: Das ist normal für Dateien aus dem Internet ohne Apple-Signatur. **Done** klicken, dann einmal im Terminal die Sperre für den ganzen Ordner aufheben:
     ```
     xattr -dr com.apple.quarantine ~/Documents/tasks-main
     ```
     (Pfad anpassen, falls der Ordner woanders liegt. Tipp: `xattr -dr com.apple.quarantine ` tippen, mit Leerzeichen am Ende, dann den Ordner ins Terminal ziehen und Enter drücken.) Danach geht der Doppelklick auf alle `.command`-Dateien.
   - Alternative: **Systemeinstellungen → Datenschutz & Sicherheit** → ganz nach unten → bei „install.command“ auf **Trotzdem öffnen**.
3. Das Fenster fragt einmal nach **E-Mail und Passwort**. Das sind dieselben wie in der App (Einstellungen → Sync).
4. Es testet die Anmeldung und Claude und richtet dann den Hintergrunddienst ein. Am Ende steht **„✓ Fertig!“**. Danach kannst du das Fenster schließen.
5. macOS zeigt evtl. die Mitteilung „Hintergrundobjekt hinzugefügt: node“. Das ist der Helfer, einfach erlauben.

In der App unter **Einstellungen → Claude** steht jetzt **🟢 Online**.

---

## Wie es danach läuft
- **Kein Fenster, nichts zu tun.** Der Helfer startet bei jedem Login automatisch und startet sich selbst neu, falls er abstürzt.
- **Mac zugeklappt oder im Ruhezustand:** Aufträge (z. B. vom iPhone) warten in Firebase und laufen los, sobald der Mac wieder wach ist.
- Ein Auftrag nach dem anderen, max. 10 Min pro Auftrag.

| Datei | Wofür |
|---|---|
| `install.command` | Installieren oder updaten |
| `status.command` | Läuft er? Letzte Meldungen anzeigen |
| `uninstall.command` | Komplett entfernen (inkl. gespeichertem Passwort) |
| `start.command` | Nur zum Ausprobieren im Terminal-Fenster |
| `menubar.command` | Anzeige in der Mac-Menüleiste einrichten (braucht SwiftBar) |
| `mail-setup.command` | Apple Mail (iCloud) für die App verbinden, siehe [APPLEMAIL.md](../APPLEMAIL.md) |

Das Protokoll liegt unter `~/Library/Logs/tasks-helper.log`.

---

## Ernährung: Foto/Text → Nährwerte (Health-App)

In der Health-App (`/gym/`) unter **Ernährung → ✨ Claude** schickst du ein Foto oder einen Text („200 g Hähnchen, Reis, Kimchi“). Der Helfer lässt Claude die Nährwerte schätzen, du prüfst sie in der App und trägst sie ein.
- Läuft über dein Abo, keine API-Kosten. Claude darf dafür nur das Foto lesen (Read-Tool, nur im Arbeitsordner `~/.tasks-helper-work`).
- Das Foto liegt nur kurz in Firebase und wird nach der Auswertung gelöscht, auch auf dem Mac.
- **Für Fotos braucht es den Helfer ab Version mit Ernährung**: einmal den Update-Befehl unten ausführen. Text geht auch mit dem alten Helfer.

## Apple Mail (iCloud) in der App

Der Helfer holt deine iCloud-Mails per IMAP (wie Apple Mail) und zeigt sie in der App unter **Mail**, nur auf diesem Mac. Lesen, gelesen/ungelesen, archivieren und senden (über iCloud-SMTP, Kopie in „Gesendet“). Kein Löschen. Das App-spezifische Passwort liegt im macOS-Schlüsselbund. Einrichten: [APPLEMAIL.md](../APPLEMAIL.md).

## Schnell-Eingabe per Tastenkürzel (aus jeder App)

Der Helfer nimmt auf deinem Mac neue Aufgaben an (`http://127.0.0.1:7777/add`, nur von diesem Mac erreichbar). Mit der Kurzbefehle-App legst du dir ein Tastenkürzel dafür an, z. B. **⌃⌥N**. Das funktioniert auch, wenn gerade die Claude-App oder etwas anderes vorne ist.

**Einmalig einrichten (ca. 5 Min):**
1. App **Kurzbefehle** öffnen → oben **+** (neuer Kurzbefehl). Oben den Namen auf **Neue Aufgabe** ändern.
2. Rechts in der Suche **„Nach Eingabe fragen“** eintippen und die Aktion reinziehen. Als Frage: `Neue Aufgabe`.
3. Suche **„Inhalte von URL abrufen“** → reinziehen.
   - URL: `http://127.0.0.1:7777/add`
   - Auf den kleinen Pfeil bei der Aktion klicken, damit sich die Optionen öffnen:
   - **Methode:** POST
   - **Header** → „Neuer Header“: Schlüssel `X-Tasks`, Wert `1`
   - **Anfragetext:** JSON → „Neues Feld“ → **Text** → Schlüssel `title`, Wert: rechte Maustaste bzw. Variablen-Auswahl → **Angegebene Eingabe**
4. Optional: Suche **„Mitteilung anzeigen“** → reinziehen. Dann siehst du kurz „In der Inbox: …“.
5. Rechts oben auf das **ⓘ**-Symbol → **Tastaturkurzbefehl hinzufügen** → z. B. ⌃⌥N drücken.
6. Testen: ⌃⌥N drücken, Titel tippen, Enter. Beim ersten Mal fragt macOS, ob die Verbindung zu `127.0.0.1` erlaubt ist → **Immer erlauben**.

Die Aufgabe landet in der Inbox (auf Mac und iPhone). Funktioniert, solange der Helfer läuft (bei dir automatisch im Hintergrund).

## Anzeige in der Mac-Menüleiste (Timer + nächste Aufgabe)

Oben rechts in der Menüleiste steht dann z. B. **⏱ 12:34 Coden** (Timer läuft) oder **Live Trading · in 25 Min** (nächste Aufgabe). Klick darauf zeigt alle Termine von heute, „Timer stoppen“ und „Tasks öffnen“. Ein-/ausschalten: in der App **Einstellungen → Mac-Menüleiste**.

Dafür brauchst du die kostenlose App **SwiftBar** (Open Source, zeigt kleine Skripte in der Menüleiste an).

**Einmalig einrichten (ca. 5 Min):**
1. Zuerst den Helfer updaten (Befehl unter „Updates“ unten). Der alte Helfer kennt die Menüleiste noch nicht.
2. SwiftBar laden: [github.com/swiftbar/SwiftBar/releases/latest](https://github.com/swiftbar/SwiftBar/releases/latest) → unter „Assets“ die `.zip` laden → entpacken → `SwiftBar.app` in **Programme** ziehen → einmal öffnen. Fragt SwiftBar nach einem Plugin-Ordner: einfach abbrechen, das macht der nächste Schritt.
3. Im Finder `Dokumente/tasks-main/helper` öffnen und **`menubar.command`** doppelklicken.
4. In SwiftBar (Symbol in der Menüleiste → Einstellungen) **Launch at Login** anhaken.

## Wenn etwas nicht klappt
| Problem | Lösung |
|---|---|
| `Anmeldung fehlgeschlagen` | E-Mail/Passwort falsch. `install.command` nochmal doppelklicken. |
| `Missing or insufficient permissions` | Firestore-Regeln prüfen (FIREBASE.md, Schritt 4/8). |
| App zeigt „Offline“ | `status.command` doppelklicken und Screenshot an Claude schicken. |
| „Claude Code ist nicht angemeldet“ | Im Terminal `claude` starten, anmelden, dann `install.command` nochmal. |
| Kurzbefehl meldet „Verbindung fehlgeschlagen“ | Helfer läuft nicht oder ist alt. Update-Befehl unten ausführen. |
| Menüleiste zeigt ⓘ / „Mac-Helfer läuft nicht“ | Helfer updaten bzw. `status.command` doppelklicken. |
| Aufgabe bleibt auf „Claude arbeitet…“ | Mac neu starten oder `install.command` nochmal. Hängende Aufträge werden automatisch neu gestartet. |

## Updates
Am einfachsten im Terminal (lädt die neue Version, ersetzt den Ordner in Dokumente und installiert neu, dein Login bleibt):
```
cd ~/Documents && curl -L -o tasks.zip https://github.com/salkinsuirelav/tasks/archive/refs/heads/main.zip && rm -rf tasks-main && unzip -q tasks.zip && rm tasks.zip && zsh tasks-main/helper/install.command
```

Wenn sich am Helfer etwas ändert: Schritt 3 wiederholen (neue ZIP, alten Ordner ersetzen) und `install.command` nochmal doppelklicken. Deine Anmeldung bleibt erhalten.
