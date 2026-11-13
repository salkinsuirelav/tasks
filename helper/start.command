#!/bin/zsh
# Doppelklick startet den Claude-Helfer (Fenster offen lassen).
cd "$(dirname "$0")"
if launchctl print "gui/$(id -u)/com.tasks.claude-helper" >/dev/null 2>&1; then
  echo "Der Helfer läuft bereits im Hintergrund (install.command). Kein zweites Fenster nötig."
  read -k1 "?Taste drücken zum Schließen"; exit 0
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js fehlt. Bitte installieren: https://nodejs.org (LTS) und danach nochmal starten."
  read -k1 "?Taste drücken zum Schließen"; exit 1
fi
[ -d node_modules ] || npm install --no-fund --no-audit
npm start
