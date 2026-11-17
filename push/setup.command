#!/bin/zsh
# Richtet den Erinnerungs-Dienst auf Cloudflare ein (kostenloser Plan). Einfach doppelklicken.
# Kann jederzeit nochmal gestartet werden (z. B. nach einem Update). Deine Schlüssel bleiben gleich.
cd "$(dirname "$0")"
fail() { echo "\n✗ $1\n"; exit 1; }
W() { npx -y wrangler@4 "$@"; } # zsh: als Funktion, nicht als Text-Variable
echo "\n== Tasks · Erinnerungen einrichten ==\n"

command -v node >/dev/null || fail "Node.js fehlt. Siehe helper/README.md, Schritt 1."
[ -f ../js/config.js ] || fail "js/config.js nicht gefunden. Bitte den ganzen Ordner tasks-main nutzen."

# 1. Bei Cloudflare anmelden (öffnet einmal den Browser)
echo "1/4 Cloudflare-Anmeldung prüfen …"
if ! W whoami 2>/dev/null | grep -qi "associated with"; then
  echo "   Es öffnet sich gleich der Browser. Dort bei Cloudflare anmelden und „Allow“ klicken."
  W login || fail "Cloudflare-Anmeldung hat nicht geklappt."
fi

# 2. Zugangsdaten + Schlüssel (bleiben lokal in deinem Benutzerordner)
echo "2/4 Schlüssel vorbereiten …"
node ./setup-keys.mjs || fail "Schlüssel konnten nicht erstellt werden."
API_KEY=$(node ./setup-keys.mjs --config apiKey)
PROJECT=$(node ./setup-keys.mjs --config projectId)
[ -n "$API_KEY" ] && [ -n "$PROJECT" ] || fail "Firebase-Werte in js/config.js nicht gefunden."

# 3. Hochladen
echo "3/4 Dienst hochladen …"
W deploy --var "FB_API_KEY:$API_KEY" --var "FB_PROJECT:$PROJECT" || fail "Hochladen fehlgeschlagen. Screenshot an Claude schicken."

# 4. Geheimnisse bei Cloudflare speichern (nicht im Code, nicht auf GitHub)
echo "4/4 Zugangsdaten sicher bei Cloudflare hinterlegen …"
SECRETS="$HOME/.tasks-push-secrets.tmp.json"
node ./setup-keys.mjs --secrets > "$SECRETS" && chmod 600 "$SECRETS"
W secret bulk "$SECRETS"; rc=$?
rm -f "$SECRETS"
[ $rc -eq 0 ] || fail "Zugangsdaten speichern fehlgeschlagen."

echo "\n✓ Fertig! Der Dienst läuft jetzt jede Minute bei Cloudflare, auch wenn dein Mac aus ist."
echo "  Nächster Schritt: In der App auf jedem Gerät Einstellungen → Erinnerungen → „Auf diesem Gerät aktivieren“."
echo "  (Nach ca. 1 Minute steht dort „Dienst läuft“.)\n"
