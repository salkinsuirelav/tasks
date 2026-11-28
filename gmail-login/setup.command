#!/bin/zsh
# Richtet den Gmail-Login-Dienst auf Cloudflare ein (kostenloser Plan). Anleitung: GMAIL-LOGIN.md
# Kann jederzeit nochmal gestartet werden (z. B. neues Client-Secret).
cd "$(dirname "$0")"
fail() { echo "\n✗ $1\n"; exit 1; }
W() { npx -y wrangler@4 "$@"; }
echo "\n== Tasks · Gmail ohne Pop-up einrichten ==\n"

command -v node >/dev/null || fail "Node.js fehlt. Siehe helper/README.md, Schritt 1."

# 1. Cloudflare-Anmeldung (öffnet einmal den Browser)
echo "1/4 Cloudflare-Anmeldung prüfen …"
if ! W whoami 2>/dev/null | grep -qi "associated with"; then
  echo "   Es öffnet sich gleich der Browser. Dort bei Cloudflare anmelden und „Allow“ klicken."
  W login || fail "Cloudflare-Anmeldung hat nicht geklappt."
fi

# 2. Client-ID + Client-Secret aus der Google Cloud Console
echo "\n2/4 Werte aus der Google Cloud Console (GMAIL-LOGIN.md, Schritt 1)"
read "CID?   Client-ID: "
CID="${CID// /}"
[[ "$CID" == *.apps.googleusercontent.com ]] || fail "Das sieht nicht nach einer Client-ID aus (endet auf .apps.googleusercontent.com)."
read -s "SEC?   Client-Secret (du siehst beim Einfügen nichts, das ist normal): "
echo
SEC="${SEC// /}"
[ ${#SEC} -ge 10 ] || fail "Client-Secret fehlt."

# 3. Hochladen
echo "\n3/4 Dienst hochladen …"
OUT=$(W deploy --var "GOOGLE_CLIENT_ID:$CID" 2>&1 | tee /dev/tty)
URL=$(echo "$OUT" | grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' | head -1)
[ -n "$URL" ] || fail "Hochladen fehlgeschlagen oder keine Adresse bekommen. Screenshot an Claude schicken."

# 4. Secret sicher bei Cloudflare hinterlegen (nicht im Code, nicht auf GitHub)
echo "\n4/4 Client-Secret sicher bei Cloudflare hinterlegen …"
printf '%s' "$SEC" | W secret put GOOGLE_CLIENT_SECRET >/dev/null || fail "Secret speichern fehlgeschlagen."
unset SEC

printf '%s' "$URL" | pbcopy 2>/dev/null
echo "\n✓ Fertig! Adresse deines Login-Dienstes (schon kopiert):\n\n   $URL\n"
echo "  Nächster Schritt: In der App → Mail → Konten (Personen-Symbol) → bei Gmail einfügen → Speichern."
echo "  Danach auf jedem Gerät einmal „Dauerhaft anmelden“.\n"
