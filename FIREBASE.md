# Sync einrichten mit Firebase (einmalig, ca. 15 Min)

**Ergebnis:** iPhone und Mac zeigen dieselben Daten. Wenn ein Gerät weg ist, sind die Daten trotzdem noch da. Offline funktioniert weiter: Änderungen werden später automatisch hochgeladen.

**Kosten:** 0 €. Der kostenlose „Spark“-Plan reicht für eine Person locker (laut Firebase u. a. 1 GB Speicher, 50.000 Lesezugriffe und 20.000 Schreibzugriffe pro Tag).
**Wichtig:** Wenn Firebase dir ein Upgrade auf „Blaze“ anbietet oder nach einer Kreditkarte fragt, lehnst du ab. Das brauchst du nicht.

Die Firebase-Oberfläche ist meist auf Englisch. Die Menünamen hier sind deshalb englisch.

---

## Schritt 1: Projekt anlegen
1. [console.firebase.google.com](https://console.firebase.google.com) öffnen und mit deinem Google-Konto anmelden.
2. **Create a project** (oder „Get started with a Firebase project“).
3. Name: `tasks`. Google Analytics: **aus**. → **Create project**.

## Schritt 2: Login einrichten
1. Links **Build → Authentication** → **Get started**.
2. Tab **Sign-in method** → **Email/Password** → aktivieren → **Save**.
3. Tab **Users** → **Add user** → deine E-Mail und ein **neues, starkes Passwort** → **Add user**.
   - Die App hat absichtlich keine „Registrieren“-Funktion. Nur du legst hier Konten an.

## Schritt 3: Datenbank anlegen
1. Links **Build → Firestore Database** → **Create database**.
2. Falls gefragt: **Standard edition**.
3. Location: **asia-northeast3 (Seoul)**. Das kann man später nicht mehr ändern.
4. **Start in production mode** → **Create**.

## Schritt 4: Sicherheitsregeln (wichtig!)
1. In Firestore oben den Tab **Rules** öffnen.
2. Alles löschen und das hier einfügen:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

3. **Publish**.

Bedeutung: Jeder angemeldete Nutzer darf nur seinen eigenen Ordner `users/<seine-ID>` lesen und schreiben. Niemand sonst sieht deine Daten.

## Schritt 5: Config-Block holen
1. Oben links Zahnrad → **Project settings**.
2. Unten bei „Your apps“ das Web-Symbol **`</>`** anklicken.
3. App-Name: `tasks-web`. Firebase Hosting **nicht** ankreuzen. → **Register app**.
4. Firebase zeigt dir Code mit `const firebaseConfig = { ... }`. **Nur den Teil in den geschweiften Klammern** kopieren.

## Schritt 6: Config in die App eintragen
1. Auf GitHub in deinem Repo `js/config.js` öffnen → Stift-Symbol (Edit).
2. Die Zeile `export const firebaseConfig = null;` ersetzen durch:

```js
export const firebaseConfig = {
  apiKey: "…",
  authDomain: "…",
  projectId: "…",
  storageBucket: "…",
  messagingSenderId: "…",
  appId: "…"
};
```
3. **Commit changes**.
4. In `sw.js` die `VERSION` um eins hochzählen (z. B. `v0.2.1`) → **Commit changes**.

> „Ist der apiKey nicht geheim?“ Nein. Dieser Key sagt nur, *welches* Firebase-Projekt gemeint ist. Er ist dafür gemacht, öffentlich im Code zu stehen. Deine Daten schützen Login und Sicherheitsregeln aus Schritt 4.

## Schritt 7: Anmelden
1. 1–2 Min warten, dann die App neu öffnen (iPhone: 2× schließen und öffnen).
2. **Einstellungen → Sync** → E-Mail und Passwort aus Schritt 2 → **Anmelden**.
3. Unten links bzw. in den Einstellungen steht jetzt „Synchronisiert“. Was du vorher lokal angelegt hast, wird beim ersten Login hochgeladen.
4. Auf dem zweiten Gerät genauso anmelden.

## Optional, Schritt 8: Doppelt absichern
Mit den Regeln aus Schritt 4 könnte ein Fremder theoretisch ein eigenes Konto in deinem Projekt anlegen. Deine Daten sähe er nicht, er könnte aber deinen Gratis-Speicher mitbenutzen. So schließt du das aus:
1. In der App **Einstellungen → User-ID kopieren**.
2. In den Firestore-Regeln die Zeile `allow read, write: …` ersetzen durch:
```
      allow read, write: if request.auth != null && request.auth.uid == uid && uid == "DEINE-USER-ID";
```
3. **Publish**.

---

## Wenn etwas nicht klappt
- **„auth/invalid-credential“**: E-Mail oder Passwort falsch, oder der Nutzer wurde in Schritt 2 nicht angelegt.
- **„Missing or insufficient permissions“**: Die Regeln aus Schritt 4 sind nicht veröffentlicht, oder die User-ID in Schritt 8 stimmt nicht.
- **Status bleibt „Verbinde…“**: `config.js` prüfen. Fehlt ein Komma oder ein Anführungszeichen? Am Mac in Safari mit ⌥⌘C die Konsole öffnen und den Fehler als Screenshot an Claude schicken.
