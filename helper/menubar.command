#!/bin/zsh
# Richtet die Tasks-Anzeige in der Mac-Menüleiste ein (über die kostenlose App SwiftBar).
cd "$(dirname "$0")"
echo "\n== Tasks · Menüleiste einrichten ==\n"
APP=""
for a in /Applications/SwiftBar.app "$HOME/Applications/SwiftBar.app"; do [ -d "$a" ] && APP="$a"; done
if [ -z "$APP" ]; then
  echo "✗ SwiftBar ist noch nicht installiert."
  echo "  Ich öffne die Download-Seite. SwiftBar laden, in den Ordner Programme ziehen,"
  echo "  einmal öffnen und dann dieses Fenster nochmal starten (menubar.command doppelklicken)."
  open "https://github.com/swiftbar/SwiftBar/releases/latest"
  exit 1
fi
if ! /usr/bin/curl -s -m 2 http://127.0.0.1:7777/menubar >/dev/null; then
  echo "⚠︎ Der Mac-Helfer antwortet nicht oder ist alt. Bitte zuerst den Update-Befehl aus der README ausführen."
fi
DIR="$HOME/.tasks-menubar"
mkdir -p "$DIR"
cp menubar/tasks.1s.sh "$DIR/" && chmod +x "$DIR/tasks.1s.sh"
xattr -d com.apple.quarantine "$DIR/tasks.1s.sh" 2>/dev/null
defaults write com.ameba.SwiftBar PluginDirectory "$DIR"
osascript -e 'quit app "SwiftBar"' 2>/dev/null; sleep 1
open "$APP"
echo "✓ Fertig! Oben in der Menüleiste erscheint gleich die Anzeige."
echo "  Tipp: In SwiftBar-Einstellungen „Launch at Login“ anhaken, damit sie nach jedem Neustart da ist."
echo "  Ein-/ausschalten kannst du Timer und nächste Aufgabe in der App unter Einstellungen → Mac-Menüleiste."
