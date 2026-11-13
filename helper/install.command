#!/bin/zsh
# Tasks · Claude-Helfer im Hintergrund installieren
# Doppelklick genügt. Danach startet der Helfer bei jedem Login unsichtbar mit.
# Nochmal ausführen = Update (z. B. nach neuer ZIP von GitHub).

cd "$(dirname "$0")"
SRC="$PWD"
APP="$HOME/.tasks-helper-app"          # außerhalb von Dokumente/Schreibtisch, damit macOS den Zugriff nicht blockiert
LABEL="com.tasks.claude-helper"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/tasks-helper.log"
DOMAIN="gui/$(id -u)"
export PATH="$HOME/.local/bin:$HOME/.claude/local:/opt/homebrew/bin:/usr/local/bin:$PATH"

pause() { echo; read -k1 "?Taste drücken zum Schließen"; echo; }
fail() { echo "\n✗ $1"; pause; exit 1; }

echo "┌──────────────────────────────────────────┐"
echo "│  Tasks · Claude-Helfer installieren      │"
echo "└──────────────────────────────────────────┘"

NODE="$(command -v node)"
[ -n "$NODE" ] || fail "Node.js fehlt. Bitte installieren: https://nodejs.org (LTS), dann nochmal doppelklicken."
command -v claude >/dev/null 2>&1 || [ -x "$HOME/.local/bin/claude" ] || fail "Claude Code fehlt. Siehe README, Schritt 2."
[ -f "$SRC/../js/config.js" ] || fail "js/config.js nicht gefunden. Bitte den ganzen Ordner von GitHub entpacken, nicht nur helper/."

echo "1/4  Alten Hintergrund-Helfer stoppen (falls vorhanden) …"
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null

echo "2/4  Dateien nach $APP kopieren und Pakete laden …"
mkdir -p "$APP" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cp "$SRC/claude-helper.mjs" "$SRC/package.json" "$SRC/package-lock.json" "$APP/" || fail "Kopieren fehlgeschlagen."
cp "$SRC/../js/config.js" "$APP/config.js" || fail "config.js kopieren fehlgeschlagen."
(cd "$APP" && npm install --omit=dev --no-fund --no-audit --loglevel=error) || fail "npm install fehlgeschlagen. Internet da?"

echo "3/4  Anmeldung und Claude testen …"
"$NODE" "$APP/claude-helper.mjs" --setup || fail "Test fehlgeschlagen, siehe Meldung oben. Nichts installiert."

echo "4/4  Hintergrunddienst einrichten …"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$APP/claude-helper.mjs</string></array>
  <key>WorkingDirectory</key><string>$APP</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$PATH</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PL
: > "$LOG"
launchctl bootstrap "$DOMAIN" "$PLIST" || fail "Hintergrunddienst konnte nicht gestartet werden."

echo "Warte kurz auf den Start …"
sleep 8
echo "---- Protokoll ----"
tail -n 5 "$LOG"
echo "-------------------"
if grep -q "Warte auf Aufträge" "$LOG"; then
  echo "\n✓ Fertig! Der Helfer läuft jetzt im Hintergrund und startet bei jedem Login automatisch."
  echo "  In der App unter Einstellungen sollte gleich '🟢 Online' stehen."
  echo "  Dieses Fenster kannst du schließen."
else
  echo "\n⚠️ Noch keine Bestätigung im Protokoll. Prüfe in 1 Min status.command."
fi
pause
