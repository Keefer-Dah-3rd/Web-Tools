#!/bin/zsh
# Builds "Mibbit Tools.app" in ~/Applications from mibbit-tools.sh (an AppleScript wrapper that
# runs the script, so it can live in the Dock and in Spotlight). Re-run after moving Web-Tools.
set -e
HERE="${0:A:h}"
APP="$HOME/Applications/Mibbit Tools.app"
osacompile -o "$APP" -e "do shell script quoted form of \"$HERE/mibbit-tools.sh\""
# Its icon (AppIcon.icns, drawn by icon.py): the crimson orb and the tools' sparkle.
if [ -f "$HERE/AppIcon.icns" ]; then
  cp "$HERE/AppIcon.icns" "$APP/Contents/Resources/applet.icns"
  touch "$APP"
fi
echo "Built $APP"
