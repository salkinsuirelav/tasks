#!/bin/zsh
# Zeigt, ob der Claude-Helfer im Hintergrund läuft, und die letzten Meldungen.
LABEL="com.tasks.claude-helper"
LOG="$HOME/Library/Logs/tasks-helper.log"
if launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -q "state = running"; then
  echo "🟢 Helfer läuft im Hintergrund."
elif [ -f "$HOME/Library/LaunchAgents/$LABEL.plist" ]; then
  echo "🟡 Installiert, läuft aber gerade nicht (startet automatisch neu)."
else
  echo "⚪️ Nicht installiert. install.command doppelklicken."
fi
echo "\n---- Letzte Meldungen ----"
[ -f "$LOG" ] && tail -n 15 "$LOG" || echo "(noch kein Protokoll)"
echo; read -k1 "?Taste drücken zum Schließen"; echo
