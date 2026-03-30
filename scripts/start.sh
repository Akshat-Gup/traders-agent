#!/usr/bin/env bash
# Clean-start script for the Electron + Vite desktop app
set -e

cd "$(dirname "$0")/.."

echo "→ Killing any previous instances..."
pkill -TERM -f "$PWD/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron $PWD" 2>/dev/null || true
pkill -TERM -f "vite --host 127.0.0.1 --port 5173" 2>/dev/null || true
lsof -ti:5173 | xargs kill -TERM 2>/dev/null || true
sleep 1

echo "→ Starting Vite..."
nohup npx vite --host 127.0.0.1 --port 5173 > /tmp/traders-agent-vite.log 2>&1 &

echo "→ Waiting for Vite..."
for i in $(seq 1 15); do
  sleep 1
  VT=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/ 2>/dev/null)
  if [ "$VT" = "200" ]; then
    echo "  Vite ✓"
    break
  fi
  echo "  waiting... ($i)"
done

echo "→ Launching Electron..."
VITE_DEV_SERVER_URL=http://127.0.0.1:5173 nohup npx electron . > /tmp/traders-agent-electron.log 2>&1 &

echo "✓ Traders desktop started. Logs: /tmp/traders-agent-{vite,electron}.log"
