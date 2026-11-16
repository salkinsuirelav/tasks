#!/bin/zsh
# Tasks · Menüleiste (Plugin für SwiftBar). Fragt jede Sekunde den Mac-Helfer, was oben stehen soll.
# <swiftbar.title>Tasks</swiftbar.title>
# <swiftbar.hideAbout>true</swiftbar.hideAbout>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideLastUpdated>true</swiftbar.hideLastUpdated>
# <swiftbar.hideDisablePlugin>true</swiftbar.hideDisablePlugin>
# <swiftbar.hideSwiftBar>true</swiftbar.hideSwiftBar>
out=$(/usr/bin/curl -s -m 2 http://127.0.0.1:7777/menubar)
if [ -z "$out" ]; then
  echo "| sfimage=exclamationmark.circle"
  echo "---"
  echo "Mac-Helfer läuft nicht"
  echo "Tasks öffnen | href=https://salkinsuirelav.github.io/tasks/"
  exit 0
fi
echo "$out"
