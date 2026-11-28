# Gmail ohne Pop-up (dauerhaft angemeldet)

**Ergebnis:** Die App bleibt bei Gmail angemeldet, auf Mac und iPhone. Kein Fenster mehr, das jede Stunde aufblitzt.

**Warum es dafür einen kleinen Dienst braucht:** Google gibt Web-Apps ohne eigenen Server den Zugriff nur für eine Stunde. Für länger braucht es das **Client-Secret** deines Google-Projekts, und das darf nicht in die App (das Repo ist öffentlich). Deshalb läuft ein Mini-Dienst bei Cloudflare (kostenlos), der nur das Secret kennt und neue Stunden-Schlüssel holt.

- Der Dienst speichert nichts. Mails laufen nie über ihn.
- Der Dauer-Schlüssel liegt nur auf deinen Geräten (im Browser), nicht in Firebase, nicht bei Cloudflare.
- Antworten bekommt nur deine Task-App.

**Dauer:** ca. 10 Min, einmalig.

---

## 1. Client-Secret holen (3 Min)
1. [console.cloud.google.com](https://console.cloud.google.com) öffnen, oben dein Projekt für die Task-App wählen.
2. Links **APIs & Dienste → Anmeldedaten** (oder **Google Auth Platform → Clients**).
3. Deinen **OAuth-Client** (Webanwendung) anklicken.
4. Rechts stehen **Client-ID** und **Clientschlüssel** (Client-Secret). Steht dort kein Secret: **Secret hinzufügen**.
5. Beide gleich griffbereit haben (Fenster offen lassen).

## 2. App veröffentlichen (1 Min)
Sonst lässt Google die dauerhafte Anmeldung nach **7 Tagen** ablaufen.
1. Links **OAuth-Zustimmungsbildschirm** (bzw. **Google Auth Platform → Zielgruppe**).
2. Bei **Veröffentlichungsstatus: Test** auf **App veröffentlichen** → **Bestätigen**.
3. Google prüft deine App nicht (das ist nur für Apps mit vielen Nutzern nötig). Beim nächsten Login steht deshalb **„Google hat diese App nicht überprüft“**: dort auf **Erweitert** → **Weiter zu … (unsicher)**. Das ist deine eigene App, das passt.

## 3. Dienst einrichten (5 Min)
Terminal öffnen (⌘ + Leertaste → „Terminal“) und zuerst die neueste Version holen (wie bei den letzten Updates):
```
cd ~/Documents && curl -L -o tasks.zip https://github.com/salkinsuirelav/tasks/archive/refs/heads/main.zip && rm -rf tasks-main && unzip -q tasks.zip && rm tasks.zip && zsh tasks-main/helper/install.command
```
Nach **„✓ Fertig!“** eine Taste drücken. Dann:
```
zsh ~/Documents/tasks-main/gmail-login/setup.command
```
1. **Cloudflare:** Hast du noch kein Konto, öffnet sich der Browser. Registrieren bzw. anmelden und **Allow** klicken.
2. **Client-ID** einfügen → Enter. **Client-Secret** einfügen → Enter (du siehst beim Einfügen nichts, das ist normal).
3. Fragt Cloudflare nach einer **workers.dev-Subdomain**: einen Namen eintippen, z. B. `niklas-tasks`.
4. Am Ende steht **„✓ Fertig!“** und die Adresse, z. B. `https://tasks-gmail-login.niklas-tasks.workers.dev`. Sie ist schon kopiert.

> Fragt `npx` „Ok to proceed?“ → `y` und Enter.

## 4. In der App (1 Min je Gerät)
**Mac:** Mail → oben rechts **Personen-Symbol** (Konten) → bei Gmail die Adresse einfügen → **Speichern** → **Dauerhaft anmelden** → im Google-Fenster bestätigen.

**iPhone:** Einstellungen → Mail → **Konten verwalten** → **Dauerhaft anmelden**. Die Adresse ist schon da (sie synchronisiert).

Danach steht dort **„✓ Dauerhaft angemeldet auf diesem Gerät“**.

---

## Wenn etwas nicht klappt
| Meldung | Lösung |
|---|---|
| „Google hat keinen Dauer-Schlüssel geschickt“ | [myaccount.google.com/permissions](https://myaccount.google.com/permissions) → deine Task-App → **Zugriff entfernen**. Dann nochmal „Dauerhaft anmelden“. |
| „Client-ID oder Client-Secret stimmt nicht“ | Schritt 1 + `setup.command` nochmal. |
| „Die dauerhafte Anmeldung ist abgelaufen“ | Passiert z. B. nach einer Änderung deines Google-Passworts. Einmal „Weiter mit Google“. |
| „Login-Dienst nicht erreichbar“ | Online? Adresse richtig? In Cloudflare: Workers & Pages → `tasks-gmail-login` → Logs. Screenshot an Claude. |

**Ausschalten:** In der App bei Gmail **Trennen** (löscht den Dauer-Schlüssel auf diesem Gerät). Ganz widerrufen: [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

**Kosten:** 0 €. Der Dienst braucht ein paar Aufrufe pro Stunde, Cloudflare erlaubt 100.000 pro Tag.
