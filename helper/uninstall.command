#!/bin/zsh
# Entfernt den Claude-Helfer aus dem Hintergrund (inkl. gespeicherter Zugangsdaten und iCloud-Passwort für Apple Mail).
LABEL="com.tasks.claude-helper"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist" "$HOME/.tasks-helper.json"
rm -rf "$HOME/.tasks-helper-app"
# Apple Mail: Passwort aus dem Schlüsselbund und gespeicherte Adresse entfernen
while security delete-generic-password -s "tasks-icloud-mail" >/dev/null 2>&1; do :; done
rm -f "$HOME/.tasks-helper-mail.json"
echo "✓ Helfer entfernt. Er startet nicht mehr automatisch."
echo "  (Das Protokoll liegt noch unter ~/Library/Logs/tasks-helper.log)"
echo; read -k1 "?Taste drücken zum Schließen"; echo
