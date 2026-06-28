#!/bin/bash
# setup_mac.sh — one-shot setup for Myrmidon trading agent on macOS
# Run once from the trading-agent directory: bash setup_mac.sh

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
echo "=== Myrmidon Mac Setup ==="
echo "Agent directory: $DIR"

# ── 1. Find Python ────────────────────────────────────────────────────────────
PYTHON=""
for p in python3 python3.12 python3.11 python3.10 python3.9; do
    if command -v "$p" &>/dev/null; then
        PYTHON="$(command -v "$p")"
        break
    fi
done
if [ -z "$PYTHON" ]; then
    echo "ERROR: Python 3 not found. Install from https://python.org"
    exit 1
fi
echo "Python: $PYTHON ($($PYTHON --version))"

# ── 2. Install dependencies ───────────────────────────────────────────────────
echo ""
echo "Installing dependencies..."
"$PYTHON" -m pip install groq requests python-dotenv --quiet --upgrade
echo "Done."

# ── 3. Check .env ─────────────────────────────────────────────────────────────
if [ ! -f "$DIR/.env" ]; then
    cp "$DIR/.env.example" "$DIR/.env"
    echo ""
    echo "WARNING: .env created from example — fill in your API keys before running."
    echo "  nano $DIR/.env"
fi

# ── 4. Install LaunchAgent (runs scanner every 5 min, auto-starts on login) ───
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST="$PLIST_DIR/com.myrmidon.scanner.plist"
mkdir -p "$PLIST_DIR"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
    "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.myrmidon.scanner</string>

    <key>ProgramArguments</key>
    <array>
        <string>$PYTHON</string>
        <string>$DIR/scanner.py</string>
    </array>

    <key>WorkingDirectory</key>
    <string>$DIR</string>

    <key>StartInterval</key>
    <integer>300</integer>

    <key>StandardOutPath</key>
    <string>$DIR/scanner.log</string>

    <key>StandardErrorPath</key>
    <string>$DIR/scanner.log</string>

    <key>RunAtLoad</key>
    <true/>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    </dict>
</dict>
</plist>
PLIST

# Load (or reload) the agent
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo ""
echo "=== Setup complete ==="
echo ""
echo "LaunchAgent installed: $PLIST"
echo "Scanner runs every 5 minutes automatically (market-hours check is built-in)."
echo "Logs: $DIR/scanner.log"
echo ""
echo "Useful commands:"
echo "  tail -f $DIR/scanner.log          # watch live"
echo "  launchctl unload $PLIST           # pause scanner"
echo "  launchctl load   $PLIST           # resume scanner"
echo "  $PYTHON $DIR/agent.py             # manual agent run"
echo ""
echo "NEXT: Install Amphetamine from the Mac App Store so your laptop stays"
echo "awake overnight with the lid closed while the scanner runs."
