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

> Wichtig: Der Helfer braucht den ganzen Ordner, weil er die Firebase-Einstellungen aus `js/config.js` liest.

### 4. Testen
Im Terminal (Pfad ggf. anpassen):
```
cd ~/Documents/tasks-main/helper
npm install
npm run check
```
Erwartet: `✓ Alles bereit.`
- Kommt „Claude Code nicht gefunden“ → Schritt 2 wiederholen.
- Kommt „nicht angemeldet“ → `claude` im Terminal starten und anmelden.

---

## Starten (jedes Mal)

**Variante A:** Im Finder `helper/start.command` doppelklicken.
- Beim ersten Mal sagt macOS evtl. „kann nicht geöffnet werden“. Dann: **Rechtsklick → Öffnen → Öffnen**. Danach geht Doppelklick normal.

**Variante B:** Im Terminal:
```
cd ~/Documents/tasks-main/helper
npm start
```

Beim **ersten Start** fragt er nach E-Mail und Passwort. Das sind dieselben wie in der App (Einstellungen → Sync).

Danach steht da `Warte auf Aufträge …`. In der App unter **Einstellungen → Claude** steht jetzt **🟢 Online**.

**Regeln:**
- Terminal-Fenster offen lassen. Beenden mit ⌃C.
- Der Mac muss wach sein. Schläft er, warten die Aufträge und laufen los, sobald der Helfer wieder läuft.
- Ein Auftrag nach dem anderen, max. 10 Min pro Auftrag.

---

## Wenn etwas nicht klappt
| Meldung | Lösung |
|---|---|
| `Anmeldung fehlgeschlagen` | E-Mail/Passwort falsch. Beim nächsten Start neu eingeben. |
| `Missing or insufficient permissions` | Firestore-Regeln prüfen (FIREBASE.md, Schritt 4/8). |
| App zeigt „Offline“, obwohl der Helfer läuft | 1 Min warten. Sonst Terminal-Meldungen als Screenshot an Claude. |
| Aufgabe bleibt auf „Claude arbeitet…“ | Helfer neu starten. Hängende Aufträge werden automatisch neu gestartet. |

## Updates
Wenn sich am Helfer etwas ändert: Schritt 3 wiederholen (neue ZIP) und den alten Ordner ersetzen. Deine Anmeldung bleibt erhalten.

## Später möglich
- Automatischer Start beim Hochfahren des Macs (launchd).
