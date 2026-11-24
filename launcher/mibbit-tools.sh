#!/bin/zsh
# Mibbit Tools: one click from the Dock to Mibbit in Chrome with the design tools on.
#
#   1. Starts Docker Desktop if it isn't running.
#   2. Starts Mibbit's local stack (docker compose) if the app isn't answering.
#   3. Starts the design-tools helper (Web-Tools, port 5198) if it isn't answering.
#   4. Opens http://localhost:5173/?tools in Google Chrome.
#
# Everything that's already running is left alone, so clicking it again just opens Chrome.
# The helper keeps running in the background until you log out or restart; its log is in
# ~/Library/Logs/mibbit-tools/helper.log. Built into an app by make-app.sh.

MIBBIT="$HOME/Desktop/mibbit/mibbit_code/mibbit"
TOOLS="$HOME/Desktop/code/Web-Tools"
APP_URL="http://localhost:5173/?tools"
LOGS="$HOME/Library/Logs/mibbit-tools"
mkdir -p "$LOGS"
exec >>"$LOGS/launcher.log" 2>&1
echo "---- $(date)"

# An app started from the Dock gets a bare PATH: add Docker, Homebrew, the newest nvm node and
# Claude Code (the helper uses it for rewrites, palettes and designs).
NODE_DIR=$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)
export PATH="$NODE_DIR:$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

say() { osascript -e "display notification \"$1\" with title \"Mibbit Tools\"" >/dev/null 2>&1; echo "$1"; }
fail() { osascript -e "display alert \"Mibbit Tools\" message \"$1\" as warning" >/dev/null 2>&1; echo "FAIL: $1"; exit 1; }
answers() { curl -s -o /dev/null --max-time 2 "$1"; }

# 1. Docker
if ! docker info >/dev/null 2>&1; then
  say "Starting Docker…"
  open -a Docker || fail "Couldn't open Docker Desktop."
  for _ in {1..90}; do docker info >/dev/null 2>&1 && break; sleep 2; done
  docker info >/dev/null 2>&1 || fail "Docker didn't start within 3 minutes. Open Docker Desktop, then try again."
fi

# 2. Mibbit
if ! answers "http://localhost:5173/"; then
  say "Starting Mibbit (this can take a minute)…"
  (cd "$MIBBIT" && docker compose up -d --wait) || fail "Mibbit's local stack didn't start. Ask Claude to look at it (log: $LOGS/launcher.log)."
fi

# 3. The design-tools helper
if ! answers "http://127.0.0.1:5198/"; then
  command -v node >/dev/null || fail "Node isn't installed where expected, so the tools helper can't start."
  say "Starting the design tools…"
  (cd "$TOOLS" && nohup node live-editor/server.mjs live-editor/sites/mibbit.json >>"$LOGS/helper.log" 2>&1 &)
  for _ in {1..20}; do answers "http://127.0.0.1:5198/" && break; sleep 0.5; done
  answers "http://127.0.0.1:5198/" || fail "The design tools helper didn't start (log: $LOGS/helper.log)."
fi

# 4. Chrome
open -a "Google Chrome" "$APP_URL" || fail "Couldn't open Google Chrome."
say "Mibbit is open with the design tools."
