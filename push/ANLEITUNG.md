# Erinnerungen einrichten (Mac + iPhone)

**Ergebnis:** Vor jeder Aufgabe mit Uhrzeit kommt eine Mitteilung auf dem iPhone und dem Mac, z. B. „Live Trading · In 10 Min · 14:00–15:00“. Das klappt auch, wenn dein Mac zugeklappt oder aus ist.

**So funktioniert es:** Ein kleiner Dienst läuft bei Cloudflare (kostenloser Plan). Er schaut jede Minute in deine Aufgaben und schickt die Mitteilung. Dein Passwort liegt dabei nur als Geheimnis bei Cloudflare und in deinem Benutzerordner, nicht im Code und nicht auf GitHub.

**Dauer:** ca. 15 Min, einmalig.

---

## Schritt 1: Cloudflare-Konto anlegen (3 Min)
1. [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) öffnen.
2. Mit E-Mail und Passwort registrieren, dann die E-Mail bestätigen.
3. Eine Domain oder einen bezahlten Plan brauchst du nicht. Falls Cloudflare danach fragt: überspringen.

## Schritt 2: Neueste Version holen (1 Min)
Im Terminal (⌘ + Leertaste → „Terminal“) diesen Befehl einfügen und Enter drücken. Er lädt die neue Version und aktualisiert gleich deinen Mac-Helfer:
```
cd ~/Documents && curl -L -o tasks.zip https://github.com/salkinsuirelav/tasks/archive/refs/heads/main.zip && rm -rf tasks-main && unzip -q tasks.zip && rm tasks.zip && zsh tasks-main/helper/install.command
```

## Schritt 3: Dienst einrichten (5 Min)
Im Terminal:
```
zsh ~/Documents/tasks-main/push/setup.command
```
Das passiert dabei:
1. **Cloudflare-Anmeldung:** Der Browser öffnet sich. Dort bei Cloudflare anmelden und auf **Allow** klicken, dann zurück ins Terminal.
2. **Schlüssel:** Werden automatisch erstellt. Deine App-Anmeldung übernimmt es vom Mac-Helfer. Ist der nicht installiert, fragt es einmal nach E-Mail und Passwort aus der App.
3. **Hochladen:** Der Dienst kommt zu Cloudflare.
4. **Zugangsdaten:** Werden sicher bei Cloudflare hinterlegt.

Am Ende steht **„✓ Fertig!“**.

> Beim ersten Mal fragt `npx` evtl. „Need to install the following packages: wrangler … Ok to proceed?“ → `y` und Enter.

## Schritt 4: Auf dem iPhone aktivieren (2 Min)
1. Die Tasks-App **vom Home-Bildschirm** öffnen, nicht in Safari.
2. Wische die App einmal ganz zu und öffne sie neu, damit die neue Version lädt.
3. **Einstellungen → Erinnerungen**. Dort sollte nach ca. 1 Min „🟢 Erinnerungs-Dienst läuft“ stehen.
4. **„Auf diesem Gerät aktivieren“** antippen → **Erlauben**.
5. **„Test schicken“** antippen. Innerhalb von ca. 1 Min kommt „Tasks · Test ✓“.

## Schritt 5: Auf dem Mac aktivieren (1 Min)
Dasselbe in der Tasks-App auf dem Mac: Einstellungen → Erinnerungen → **Auf diesem Gerät aktivieren** → Erlauben → **Test schicken**.

---

## Einstellen
- **Standard:** Einstellungen → Erinnerungen → „Standard für Aufgaben mit Uhrzeit“ (Startzeit, 5, 10, 15, 30 Min oder 1 Std vorher). Ab Werk: 10 Min.
- **Pro Aufgabe:** In der Aufgabe unter „Erinnerung“: Standard, Keine oder eine eigene Zeit.
- **Alles aus:** Einstellungen → Erinnerungen → Aus.
- **Wiederkehrende Aufgaben** werden an jedem Termin erinnert.

## Wenn etwas nicht klappt
| Problem | Lösung |
|---|---|
| Nach 5 Min immer noch „⚪️ nicht eingerichtet“ | `setup.command` nochmal starten, Screenshot vom Terminal an Claude. |
| Knopf „Aktivieren“ fehlt auf dem iPhone | App vom Home-Bildschirm öffnen, nicht aus Safari. |
| „Mitteilungen sind nicht erlaubt“ | iPhone: Einstellungen → Mitteilungen → Tasks → erlauben. Mac: Systemeinstellungen → Mitteilungen → Tasks. |
| Test kommt nicht | 2 Min warten. Dann in Cloudflare: Workers & Pages → tasks-reminders → Logs. Screenshot an Claude. |
| Passwort der App geändert | `rm ~/.tasks-push-keys.json`, dann `setup.command` nochmal. Danach auf jedem Gerät neu aktivieren. |

**Kosten:** 0 €. Cloudflare erlaubt im kostenlosen Plan 100.000 Aufrufe pro Tag, der Dienst braucht ca. 1.440. Firebase bleibt im kostenlosen Spark-Plan (der Dienst braucht ca. 20.000–25.000 der 50.000 kostenlosen Lesezugriffe pro Tag).
