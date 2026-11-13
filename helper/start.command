#!/bin/zsh
# Doppelklick startet den Claude-Helfer (Fenster offen lassen).
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js fehlt. Bitte installieren: https://nodejs.org (LTS) und danach nochmal starten."
  read -k1 "?Taste drücken zum Schließen"; exit 1
fi
[ -d node_modules ] || npm install --no-fund --no-audit
npm start
