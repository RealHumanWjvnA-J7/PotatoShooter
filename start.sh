#!/usr/bin/env bash
# Launches a tiny local HTTP server (needed because browsers block module/GLTF
# loading over file://) and opens the demo in the default browser.

cd "$(dirname "$0")"

PORT=8642

if command -v python3 >/dev/null 2>&1; then
  SERVE_CMD="python3 -m http.server $PORT"
elif command -v python >/dev/null 2>&1; then
  SERVE_CMD="python -m http.server $PORT"
elif command -v npx >/dev/null 2>&1; then
  SERVE_CMD="npx --yes http-server -p $PORT"
else
  echo "No python3, python, or npx found. Install one of these to run the local server."
  exit 1
fi

echo "Starting local server on http://localhost:$PORT ..."
$SERVE_CMD &
SERVER_PID=$!

sleep 1

URL="http://localhost:$PORT/index.html"
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1
elif command -v gio >/dev/null 2>&1; then
  gio open "$URL" >/dev/null 2>&1
else
  echo "Open this in your browser: $URL"
fi

echo "Press Ctrl+C to stop the server."
wait $SERVER_PID
