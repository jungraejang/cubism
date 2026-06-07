#!/usr/bin/env bash
#
# Launch the Cubism renderer and open it fullscreen in Chromium kiosk mode
# with the mouse cursor hidden. Intended for the Raspberry Pi hologram display
# so a single command brings up the server *and* the UI.
#
#   pnpm --filter renderer kiosk     # from the repo (runs this script)
#   ./apps/renderer/scripts/kiosk.sh # directly
#
# Environment overrides:
#   CUBISM_RENDERER_URL    URL to open (default http://localhost:3001)
#   PORT                   Port the renderer listens on (default 3001)
#   CUBISM_KIOSK_SERVE     1 = start `next start` here, 0 = assume it's already
#                          running (e.g. under systemd). Default 1.
#   CUBISM_KIOSK_WAIT      Seconds to wait for the server to answer (default 60)
#
set -euo pipefail

URL="${CUBISM_RENDERER_URL:-http://localhost:${PORT:-3001}}"
SERVE="${CUBISM_KIOSK_SERVE:-1}"
WAIT_SECONDS="${CUBISM_KIOSK_WAIT:-60}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

SERVER_PID=""
UNCLUTTER_PID=""

cleanup() {
  [[ -n "$UNCLUTTER_PID" ]] && kill "$UNCLUTTER_PID" 2>/dev/null || true
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# 1. Start the renderer (production server) unless told it's already running.
if [[ "$SERVE" == "1" ]]; then
  echo "[kiosk] starting renderer (next start) ..."
  ( cd "$REPO_ROOT" && pnpm --filter renderer start ) &
  SERVER_PID=$!
fi

# 2. Wait until the renderer answers before opening the browser.
echo "[kiosk] waiting for $URL (up to ${WAIT_SECONDS}s) ..."
ready=0
for _ in $(seq 1 "$WAIT_SECONDS"); do
  if curl -fsS -o /dev/null "$URL" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != "1" ]]; then
  echo "[kiosk] renderer did not respond at $URL" >&2
  exit 1
fi
echo "[kiosk] renderer is up."

# 3. Hide the mouse cursor. unclutter is the standard tool on X11/LXDE.
if command -v unclutter >/dev/null 2>&1; then
  unclutter -idle 0 -root >/dev/null 2>&1 &
  UNCLUTTER_PID=$!
else
  echo "[kiosk] 'unclutter' not found - cursor will remain visible."
  echo "[kiosk] install it with:  sudo apt install unclutter"
fi

# 4. Find a Chromium binary (apt names it chromium-browser, snap/others chromium).
CHROMIUM=""
for bin in chromium-browser chromium chromium-browser-stable google-chrome; do
  if command -v "$bin" >/dev/null 2>&1; then
    CHROMIUM="$bin"
    break
  fi
done
if [[ -z "$CHROMIUM" ]]; then
  echo "[kiosk] no Chromium binary found (tried chromium-browser, chromium)." >&2
  echo "[kiosk] install it with:  sudo apt install chromium-browser" >&2
  exit 1
fi

# 5. Launch the kiosk. Not exec'd, so the EXIT trap still tears the server down
#    when Chromium is closed.
echo "[kiosk] launching $CHROMIUM in kiosk mode ..."
"$CHROMIUM" \
  --kiosk \
  --start-fullscreen \
  --disable-infobars \
  --noerrdialogs \
  --no-first-run \
  --fast --fast-start \
  --disable-translate \
  --disable-features=TranslateUI \
  --disable-session-crashed-bubble \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  "$URL"
