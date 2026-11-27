#!/bin/zsh
# Tasks · Apple Mail (iCloud) verbinden
# Fragt einmal deine iCloud-Adresse und ein App-spezifisches Passwort ab, testet die Verbindung
# und legt das Passwort im macOS-Schlüsselbund ab (nicht in einer Datei). Nochmal ausführen = Passwort ersetzen.

cd "$(dirname "$0")"
APP="$HOME/.tasks-helper-app"
SERVICE="tasks-icloud-mail"
CONF="$HOME/.tasks-helper-mail.json"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

pause() { echo; read -k1 "?Taste drücken zum Schließen"; echo; }
fail() { echo "\n✗ $1"; pause; exit 1; }

echo "┌──────────────────────────────────────────┐"
echo "│  Tasks · Apple Mail (iCloud) verbinden   │"
echo "└──────────────────────────────────────────┘"

NODE="$(command -v node)"
[ -n "$NODE" ] || fail "Node.js fehlt. Zuerst den Mac-Helfer installieren (helper/README.md)."
[ -f "$APP/mail-icloud.mjs" ] || fail "Der Mac-Helfer ist noch nicht installiert oder zu alt. Zuerst den Update-Befehl aus APPLEMAIL.md (Schritt 2) ausführen."

echo
echo "Du brauchst ein App-spezifisches Passwort von account.apple.com (Anleitung: APPLEMAIL.md, Schritt 1)."
echo "Dein normales Apple-Passwort funktioniert hier nicht und wird auch nicht gebraucht."
echo
read "EMAIL?iCloud-Mailadresse (z. B. name@icloud.com): "
EMAIL="${(L)${EMAIL// /}}"
[[ "$EMAIL" == *@*.* ]] || fail "Das sieht nicht nach einer Mailadresse aus."

echo "\nJetzt das App-spezifische Passwort einfügen (⌘V) und Enter drücken."
echo "Beim Einfügen siehst du nichts, das ist normal."
read -rs "PW?Passwort: "; echo
PW="${PW// /}"
[ -n "$PW" ] || fail "Kein Passwort eingegeben."
RE='^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$'
[[ "$PW" =~ $RE ]] || echo "⚠️  Ein App-spezifisches Passwort sieht normalerweise so aus: abcd-efgh-ijkl-mnop. Ich teste es trotzdem."

echo "\n1/2  Teste die Verbindung zu iCloud …"
print -r -- "$PW" | "$NODE" "$APP/mail-icloud.mjs" --check "$EMAIL" || { PW=""; fail "Hat nicht geklappt. Adresse und Passwort prüfen und mail-setup.command nochmal starten."; }

echo "2/2  Passwort im Schlüsselbund speichern …"
security add-generic-password -U -a "$EMAIL" -s "$SERVICE" -l "Tasks · iCloud Mail" -j "App-spezifisches Passwort für Apple Mail in der Task-App" -T /usr/bin/security -w "$PW" \
  || { PW=""; fail "Speichern im Schlüsselbund fehlgeschlagen."; }
PW=""
print -r -- "{\"user\":\"$EMAIL\"}" > "$CONF" && chmod 600 "$CONF" || fail "Konnte $CONF nicht schreiben."

echo "\n✓ Fertig! Apple Mail ist mit $EMAIL verbunden."
echo "  Öffne jetzt die Task-App auf diesem Mac → Mail → bei Apple Mail auf „Verbinden“."
echo "  Das Passwort liegt im Schlüsselbund unter „Tasks · iCloud Mail“. Dieses Fenster kannst du schließen."
pause
