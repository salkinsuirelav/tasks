# Gmail in der Task-App einrichten

Einmalig, dauert etwa 10 Minuten. Danach meldest du dich in der App nur noch mit Google an.

**Warum das nötig ist:** Google lässt eine App erst an Gmail, wenn sie eine eigene „Client-ID“ hat. Die erstellst du in deinem eigenen Google-Cloud-Projekt. Das ist kostenlos, und nur du kannst dich darüber anmelden.

**Was die App darf:** Posteingang lesen, Mails archivieren und als gelesen/ungelesen markieren (Berechtigung `gmail.modify`). Sie kann **keine** Mails senden oder endgültig löschen.

**Datenschutz:** Deine Mails werden direkt zwischen deinem Gerät und Google geladen. Die App speichert sie nirgends, auch nicht in Firebase. Bilder aus dem Netz (oft Zählpixel) lädt sie erst, wenn du auf „Bilder laden“ klickst.

## 1. Projekt anlegen
1. Öffne https://console.cloud.google.com und melde dich mit deinem Gmail-Konto an.
2. Oben links auf die Projektauswahl → **Neues Projekt** → Name z. B. `Tasks` → **Erstellen**. Danach das Projekt oben auswählen.

## 2. Gmail-API einschalten
1. Menü → **APIs und Dienste** → **Bibliothek**.
2. Nach **Gmail API** suchen → **Aktivieren**.

## 3. Anmeldeseite (OAuth) einrichten
1. Menü → **Google Auth Platform** (in älteren Ansichten: „OAuth-Zustimmungsbildschirm“) → **Jetzt starten**.
2. App-Name `Tasks`, Support-E-Mail: deine Adresse.
3. Zielgruppe: **Extern**. Kontakt-E-Mail: deine Adresse. Bestätigen → **Erstellen**.
4. Unter **Zielgruppe** → **Testnutzer** → **Nutzer hinzufügen** → deine Gmail-Adresse. Den Status „Testen“ lässt du so.

## 4. Client-ID erstellen
1. **Clients** → **Client erstellen**.
2. Anwendungstyp: **Webanwendung**, Name `Tasks`.
3. Unter **Autorisierte JavaScript-Quellen** → **URI hinzufügen** → `https://salkinsuirelav.github.io`
4. **Erstellen** → die **Client-ID** kopieren (endet auf `.apps.googleusercontent.com`). Ein Client-Secret brauchst du nicht.

## 5. In der App
1. Links auf **Mail** → Client-ID einfügen → **Speichern**. Sie wird über deinen Sync auch aufs iPhone übertragen.
2. **Mit Google anmelden** → Konto wählen.
3. Google zeigt „Google hat diese App nicht überprüft“. Das ist normal, weil es deine eigene App ist: **Weiter** → Häkchen bei Gmail setzen → **Weiter**.

Google gibt der App immer nur für eine Stunde Zugriff. Danach zeigt die App „Weiter mit Google“: ein Klick, ohne neue Bestätigung.

## Trennen
In der App oben rechts auf **×** (Gmail trennen). Den Zugriff ganz entziehen kannst du unter https://myaccount.google.com/permissions.
