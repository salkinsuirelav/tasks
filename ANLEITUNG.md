# Tasks v0.2: Update hochladen

## 1. Dateien zu GitHub hochladen (ca. 5 Min)

1. `task-app.zip` entpacken. Im Ordner `task-app` liegen die Ordner `css/` und `js/` und ein paar Dateien.
2. Dein Repo öffnen: `github.com/salkinsuirelav/tasks`
3. Oben rechts **Add file → Upload files**
4. **Alles aus dem Ordner** (`css`, `js`, `index.html`, `sw.js`, `manifest.json`, Icons) ins Fenster ziehen.
   - Die Ordner `css` und `js` mitziehen, GitHub übernimmt die Struktur.
   - Gleichnamige Dateien werden überschrieben. Das ist gewollt.
5. Unten **Commit changes**
6. 1–2 Min warten. Danach auf dem iPhone die App **zweimal** öffnen und schließen, damit die neue Version geladen wird.

Prüfen: In der Repo-Übersicht sollten jetzt die Ordner `css` und `js` zu sehen sein.

> Tipp: Wenn du [GitHub mit Claude verbindest](https://claude.ai/connect-github), kann ich künftige Updates direkt pushen. Dann fällt dieser Schritt weg.

## 2. Ausprobieren

- **Einstellungen → Beispieldaten laden**: Dann siehst du sofort, wie Plan, Kalender und Rückblick gefüllt aussehen. Später einfach wieder löschen.
- Auf dem Mac: Tasks aus der Kalender-Seitenleiste in einen Slot ziehen.
- Auf dem iPhone: Task antippen und Datum und Uhrzeit setzen. Drag & Drop funktioniert dort nur eingeschränkt.

## 3. Sync einrichten

→ Siehe `FIREBASE.md` (ca. 15 Min, einmalig)

---

## Wie die App aufgebaut ist (zum Verstehen)

| Datei | Aufgabe |
|---|---|
| `index.html` | Grundgerüst: Seitenleiste, Hauptbereich, Tab-Leiste fürs iPhone |
| `css/app.css` | Komplettes Design. Farben stehen ganz oben als Variablen (`--bg`, `--accent`, …) |
| `js/app.js` | Steuerung: Klicks, Tippen, Drag & Drop, welche Ansicht offen ist |
| `js/views.js` | Alle Ansichten als HTML-Bausteine (Inbox, Plan, Kalender, …) |
| `js/model.js` | Logik: Erledigen + Wiederholen, Timer, freie Slots, Auto-Plan, Claude-Prompts |
| `js/store.js` | Daten speichern (lokal) + Sync mit Firebase |
| `js/util.js` | Helfer für Datum, Dauer, Prioritäten |
| `js/config.js` | Hier kommt dein Firebase-Config-Block rein |
| `sw.js` | Offline-Modus. **Bei jedem Update `VERSION` hochzählen.** |

**Erste Übung für dich:** Ändere in `css/app.css` ganz oben `--accent: #2f6f78;` auf eine andere Farbe, lade nur diese Datei hoch und zähle in `sw.js` die Version auf `v0.2.1` hoch. So lernst du den Update-Ablauf.
