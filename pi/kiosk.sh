#!/usr/bin/env bash
# Waits for the mirror server, then opens Chromium full-screen.
until curl -s -o /dev/null http://localhost:8000; do sleep 1; done
BROWSER="$(command -v chromium-browser || command -v chromium)"
exec "$BROWSER" --kiosk --noerrdialogs --disable-infobars \
  --disable-session-crashed-bubble --no-first-run \
  --check-for-update-interval=31536000 http://localhost:8000
