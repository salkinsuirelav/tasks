# Apple Mail (iCloud) in der Task-App einrichten

Einmalig, dauert etwa 5 Minuten. Danach siehst du deine iCloud-Mails in der App unter **Mail**, zusammen mit Gmail.

**Warum das über den Mac-Helfer läuft:** iCloud hat keine Schnittstelle für Web-Apps. Der Mac-Helfer holt deine Mails deshalb so ab wie Apple Mail selbst (per IMAP) und gibt sie nur an die Task-App auf demselben Mac weiter.

**Wichtig:**
- Geht nur auf dem **Mac**, auf dem der Helfer läuft. Auf dem iPhone nutzt du weiter die Mail-App.
- Die App kann Mails **lesen, schreiben, beantworten, weiterleiten, als gelesen/ungelesen markieren und archivieren** (Ordner „Archive“ in iCloud). Löschen kann sie nicht.
- Deine Mails werden nirgends gespeichert, auch nicht in Firebase. Bilder aus dem Netz (oft Zählpixel) lädt die App erst, wenn du auf „Bilder laden“ klickst.
- Das Passwort liegt im **macOS-Schlüsselbund**, nicht in einer Datei.

---

## 1. App-spezifisches Passwort erstellen
Dein normales Apple-Passwort funktioniert hier nicht (und wird auch nicht gebraucht). Apple gibt dafür ein eigenes Passwort nur für diese eine App aus.

1. [account.apple.com](https://account.apple.com) öffnen und mit deinem Apple-Account anmelden.
2. **Anmeldung und Sicherheit** → **App-spezifische Passwörter**.
3. **App-spezifisches Passwort generieren** (bzw. **+**) → Name: `Tasks Mail` → **Erstellen**.
4. Das Passwort sieht so aus: `abcd-efgh-ijkl-mnop`. **Kopieren** (⌘C). Apple zeigt es nur einmal an, du brauchst es gleich in Schritt 3.

> Geht nur, wenn die Zwei-Faktor-Authentifizierung an ist. Das ist bei fast allen Apple-Accounts der Fall.

## 2. Mac-Helfer updaten
Terminal öffnen (⌘ + Leertaste → „Terminal“) und diesen Befehl einfügen (wie bei den letzten Updates):
```
cd ~/Documents && curl -L -o tasks.zip https://github.com/salkinsuirelav/tasks/archive/refs/heads/main.zip && rm -rf tasks-main && unzip -q tasks.zip && rm tasks.zip && zsh tasks-main/helper/install.command
```
Am Ende steht **„✓ Fertig!“** und **„Taste drücken zum Schließen“**. **Erst eine Taste drücken** (z. B. Enter), dann geht es weiter. Fenster offen lassen.

## 3. iCloud verbinden
Im gleichen Terminal-Fenster:
```
zsh ~/Documents/tasks-main/helper/mail-setup.command
```
(Oder im Finder `Dokumente/tasks-main/helper` öffnen und **`mail-setup.command`** doppelklicken.)

1. **iCloud-Mailadresse** eintippen, z. B. `name@icloud.com` → Enter.
2. Das **App-spezifische Passwort** einfügen (⌘V) → Enter. Du siehst beim Einfügen nichts, das ist normal.
3. Der Helfer testet die Verbindung zu iCloud. Klappt es, steht da **„✓ Verbunden mit … Im Posteingang: … Mails.“** und danach **„✓ Fertig!“**.

## 4. In der App
1. Die Task-App **auf dem Mac** öffnen → links **Mail**.
2. Bei **Apple Mail (iCloud)** auf **Verbinden** klicken.
3. Dein Posteingang erscheint. Sobald Gmail auch verbunden ist, siehst du beide zusammen und kannst oben zwischen **Alle / Gmail / iCloud** umschalten.

Am besten öffnest du die App dafür in **Zen** oder Chrome. Ob die Safari-Web-App (im Dock) die Verbindung zum Helfer erlaubt, ist noch ungetestet. Blockiert ein Browser sie, sagt die App dir das.

---

## Was du in der App machen kannst
- **Mail öffnen:** wird in iCloud als gelesen markiert (wie in Apple Mail).
- **Als ungelesen markieren**, **Archivieren** (mit „Rückgängig“).
- **Mail → Aufgabe:** legt eine Aufgabe mit Absender und Link an. Der Link öffnet die Mail direkt in Apple Mail.
- **Schreiben, Antworten, Allen antworten, Weiterleiten:** wie bei Gmail. Bei einer iCloud-Mail geht die Antwort automatisch über iCloud. Bei einer neuen Mail wählst du oben bei **Von** zwischen Gmail und iCloud. Gesendet wird über iCloud selbst (wie Apple Mail), eine Kopie landet in **Gesendet**.
- **↗ In Apple Mail öffnen:** oben rechts in der geöffneten Mail. Anhänge öffnest du auch dort. Anhänge mitschicken geht in der App noch nicht.

## Trennen und entfernen
- **Nur in der App ausblenden:** Mail → **⋯** (Konten) → bei Apple Mail **Trennen**. Das Passwort bleibt im Schlüsselbund, du kannst jederzeit wieder auf „Verbinden“ klicken.
- **Zugriff ganz entziehen:** Auf [account.apple.com](https://account.apple.com) → App-spezifische Passwörter → `Tasks Mail` **widerrufen**. Damit ist das Passwort sofort ungültig.
- **Passwort vom Mac löschen:** App **Schlüsselbundverwaltung** → nach `Tasks · iCloud Mail` suchen → löschen. `uninstall.command` entfernt es auch.

## Wenn etwas nicht klappt
| Meldung in der App | Lösung |
|---|---|
| „Der Mac-Helfer läuft gerade nicht“ | `status.command` doppelklicken. Läuft er nicht: Schritt 2 nochmal. |
| „Der Mac-Helfer ist noch die alte Version“ | Schritt 2 (Update) ausführen. Für Senden über iCloud braucht es den Helfer ab Ende November 2026. |
| „Auf diesem Mac ist Apple Mail noch nicht eingerichtet“ | Schritt 3 ausführen. |
| „iCloud lehnt die Anmeldung ab“ | Neues App-spezifisches Passwort erstellen (Schritt 1), dann Schritt 3 nochmal. Das ersetzt das alte. |
| „Dieser Browser erreicht ihn nicht“ | App in Zen oder Chrome auf diesem Mac öffnen. |
| macOS fragt, ob `security` auf den Schlüsselbund zugreifen darf | **Immer erlauben**. Das ist der Helfer, der das Passwort liest. |
