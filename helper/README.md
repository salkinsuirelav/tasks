# Claude-Helfer für den Mac

**Was er macht:** Du tippst in der App bei einer Aufgabe auf **„An Claude senden“** oder im Kalender auf **„Mit Claude planen → Claude planen lassen“**. Der Helfer auf deinem Mac holt den Auftrag über Firebase ab, lässt Claude Code laufen (über dein Claude-Abo, keine API-Kosten) und schreibt das Ergebnis zurück:
- **Aufgabe:** Ergebnis landet in den Notizen der Aufgabe, Status geht von „Wartet“ auf „Offen“.
- **Wochenplanung:** Der Plan wird automatisch in den Kalender übernommen (mit „Rückgängig“).

Das funktioniert auch vom iPhone aus, solange der Helfer auf dem Mac läuft.

**Sicherheit:** Claude darf hier nur im Web suchen und lesen. Befehle ausführen und Dateien ändern ist gesperrt. Dein Passwort liegt nur lokal in `~/.tasks-helper.json`.

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
   - Sagt macOS „kann nicht geöffnet werden“: **Rechtsklick → Öffnen → Öffnen**.
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

Das Protokoll liegt unter `~/Library/Logs/tasks-helper.log`.

## Wenn etwas nicht klappt
| Problem | Lösung |
|---|---|
| `Anmeldung fehlgeschlagen` | E-Mail/Passwort falsch. `install.command` nochmal doppelklicken. |
| `Missing or insufficient permissions` | Firestore-Regeln prüfen (FIREBASE.md, Schritt 4/8). |
| App zeigt „Offline“ | `status.command` doppelklicken und Screenshot an Claude schicken. |
| „Claude Code ist nicht angemeldet“ | Im Terminal `claude` starten, anmelden, dann `install.command` nochmal. |
| Aufgabe bleibt auf „Claude arbeitet…“ | Mac neu starten oder `install.command` nochmal. Hängende Aufträge werden automatisch neu gestartet. |

## Updates
Wenn sich am Helfer etwas ändert: Schritt 3 wiederholen (neue ZIP, alten Ordner ersetzen) und `install.command` nochmal doppelklicken. Deine Anmeldung bleibt erhalten.
