#!/bin/zsh
# Entfernt den Claude-Helfer aus dem Hintergrund (inkl. gespeicherter Zugangsdaten).
LABEL="com.tasks.claude-helper"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist" "$HOME/.tasks-helper.json"
rm -rf "$HOME/.tasks-helper-app"
echo "✓ Helfer entfernt. Er startet nicht mehr automatisch."
echo "  (Das Protokoll liegt noch unter ~/Library/Logs/tasks-helper.log)"
echo; read -k1 "?Taste drücken zum Schließen"; echo
