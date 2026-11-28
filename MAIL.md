# Gmail in der Task-App einrichten

> Apple Mail (iCloud) richtest du separat ein: [APPLEMAIL.md](APPLEMAIL.md). Sind beide verbunden, siehst du alles in einem Posteingang.

Einmalig, dauert etwa 10 Minuten, am besten am Mac. Danach meldest du dich in der App nur noch mit Google an.

**Warum das nötig ist:** Google lässt eine App erst an Gmail, wenn sie eine eigene „Client-ID“ hat. Die erstellst du in deinem eigenen Google-Cloud-Projekt. Das ist kostenlos, und nur du (als Testnutzer) kannst dich darüber anmelden.

**Was die App macht:** Posteingang lesen, archivieren, als gelesen/ungelesen markieren, Mail → Aufgabe, Mails **schreiben, antworten und weiterleiten**. Dafür reicht die Google-Berechtigung `gmail.modify`, die du beim Login bestätigst (Google beschreibt sie als „E-Mails lesen, verfassen, senden …“). Die App sendet nur, wenn du selbst auf **Senden** klickst, und löscht nichts (der Code ist öffentlich im Repo).

**Datenschutz:** Deine Mails werden direkt zwischen deinem Gerät und Google geladen. Die App speichert sie nirgends, auch nicht in Firebase. Bilder aus dem Netz (oft Zählpixel) lädt sie erst, wenn du auf „Bilder laden“ klickst.

---

## 1. Projekt anlegen
1. [console.cloud.google.com](https://console.cloud.google.com) öffnen und mit deinem **Gmail-Konto** anmelden (dem, dessen Mails du sehen willst).
2. Beim ersten Mal: Nutzungsbedingungen bestätigen. Land: Südkorea oder Deutschland, egal.
3. Oben links auf die **Projektauswahl** → **Neues Projekt** → Name `Tasks` → **Erstellen**.
4. Warten, bis es fertig ist, dann oben in der Projektauswahl **Tasks** auswählen. Wichtig: Alle weiteren Schritte passieren in diesem Projekt.

## 2. Gmail-API einschalten
1. Oben in die Suchleiste `Gmail API` tippen → Ergebnis **Gmail API** (Marketplace) anklicken.
2. **Aktivieren**.

## 3. Anmeldeseite einrichten (Google Auth Platform)
1. Menü ☰ → **APIs und Dienste** → **OAuth-Zustimmungsbildschirm** (heißt in neueren Ansichten **Google Auth Platform**) → **Jetzt starten**.
2. **App-Informationen:** App-Name `Tasks`, Nutzersupport-E-Mail: deine Adresse → **Weiter**.
3. **Zielgruppe:** **Extern** → **Weiter**.
4. **Kontaktdaten:** deine Adresse → **Weiter**.
5. Richtlinie bestätigen → **Weiter** → **Erstellen**.
6. **Wichtig, sonst kommt „Fehler 403: access_denied“:** Testnutzer eintragen.
   Direktlink: [console.cloud.google.com/auth/audience](https://console.cloud.google.com/auth/audience) (oben muss das Projekt **Tasks** ausgewählt sein).
   Auf der Seite „Zielgruppe“ ganz nach **unten** scrollen → Abschnitt **Testnutzer** → **+ Add users** / **Nutzer hinzufügen** → deine Gmail-Adresse → **Speichern**.
   In älteren Ansichten: ☰ → APIs und Dienste → OAuth-Zustimmungsbildschirm → ganz unten „Testnutzer“.
   Den Status **„Testen“** lässt du so. „Veröffentlichen“ brauchst du nicht.

## 4. Client-ID erstellen
1. Links **Clients** → **+ Client erstellen**.
2. Anwendungstyp: **Webanwendung**. Name: `Tasks`.
3. Bei **Autorisierte JavaScript-Quellen** → **+ URI hinzufügen** → genau das hier eintragen:
   ```
   https://salkinsuirelav.github.io
   ```
   Ohne `/tasks` und ohne `/` am Ende. „Autorisierte Weiterleitungs-URIs“ bleibt leer.
4. **Erstellen**. Es erscheint die **Client-ID** (endet auf `.apps.googleusercontent.com`) → kopieren.
   Den „Clientschlüssel“ (Client-Secret) brauchst du **nicht**. Nirgends eintragen, nicht weitergeben.

> Die Client-ID ist kein Geheimnis, sie ist eh in jeder Anmeldung sichtbar. Sie funktioniert nur auf deiner App-Adresse und nur für Testnutzer.

## 5. In der App
1. Task-App öffnen → links **Mail**.
   Ist Apple Mail schon verbunden, siehst du gleich den Posteingang. Dann oben rechts auf das **Personen-Symbol** (Konten) tippen.
2. Bei **Gmail** die Client-ID einfügen → **Speichern**. Sie wird über deinen Sync auch aufs iPhone übertragen.
3. **Mit Google anmelden** → dein Konto wählen.
4. Google zeigt **„Google hat diese App nicht überprüft“**. Das ist normal, weil es deine eigene App ist: **Weiter**.
5. Beim Zugriff das **Häkchen für Gmail** setzen → **Weiter**.
6. Dein Posteingang erscheint. Mit iCloud zusammen kannst du oben zwischen **Alle / Gmail / iCloud** umschalten.

## Im Alltag
- Google gibt Web-Apps immer nur **eine Stunde** Zugriff (lässt sich nicht ändern). Die App erneuert ihn beim ersten Klick in Mail selbst, ein Fenster blitzt kurz auf. Klappt das nicht (z. B. Pop-up blockiert), steht oben **„Weiter mit Google“**: ein Klick, ohne neue Bestätigung.
- **Ordner:** oben links neben „Alle | Ungelesen“: Posteingang, Archiv, Gesendet, Spam, Papierkorb. Aus Archiv, Spam und Papierkorb holst du Mails mit dem Posteingang-Symbol zurück. Spam sortiert Gmail selbst aus, er taucht im Posteingang der App nie auf.
- **iPhone:** Die Client-ID ist schon da (Sync), du meldest dich dort einfach einmal mit Google an. Ob das Google-Fenster in der App vom Home-Bildschirm sauber aufgeht, ist noch ungetestet. Klappt es nicht, schick mir einen Screenshot.
- **Mail → Aufgabe:** ✓-Symbol an der Mail. Die Aufgabe bekommt Absender und einen Link zurück zur Mail in Gmail.
- **Schreiben:** oben rechts **Schreiben** (iPhone: Stift-Knopf unten rechts). In einer geöffneten Mail: **Antworten**, **Allen antworten**, **Weiterleiten**. Die Antwort landet in Gmail im selben Verlauf.
- **Rückgängig:** Nach „Senden“ hast du 5 Sekunden Zeit. `⌘ + Enter` sendet direkt aus dem Textfeld.
- Gesendete Mails findest du wie gewohnt in Gmail unter **Gesendet**. Anhänge kann die App noch nicht mitschicken (beim Weiterleiten sagt sie dir das).

## Trennen
- In der App: Mail → Personen-Symbol (Konten) → bei Gmail **Trennen**. Gilt nur für dieses Gerät.
- Zugriff ganz entziehen: [myaccount.google.com/permissions](https://myaccount.google.com/permissions) → `Tasks` → **Zugriff entfernen**.

## Wenn etwas nicht klappt
| Meldung | Lösung |
|---|---|
| **Fehler 400: origin_mismatch** | Schritt 4.3: Die JavaScript-Quelle muss genau `https://salkinsuirelav.github.io` sein. Nach dem Ändern 5 Min warten. |
| **Fehler 403: access_denied** („Zugriff blockiert: Die Überprüfung … wurde nicht abgeschlossen“) | Schritt 3.6: Deine Gmail-Adresse fehlt bei den Testnutzern. Direktlink: [console.cloud.google.com/auth/audience](https://console.cloud.google.com/auth/audience) |
| „Bitte beim Google-Login das Häkchen für Gmail setzen“ | Nochmal anmelden und das Gmail-Häkchen setzen. |
| „Gmail antwortet gerade nicht (403)“ | Schritt 2: Gmail-API ist im Projekt nicht aktiviert (oder ein anderes Projekt war ausgewählt). |
| Anmeldefenster geht nicht auf | Pop-ups für `salkinsuirelav.github.io` im Browser erlauben. |
| „Das sieht nicht nach einer Client-ID aus“ | Du hast evtl. den Clientschlüssel kopiert. Die ID endet auf `.apps.googleusercontent.com`. |
