#!/usr/bin/env bash
# Clean-start script for Market Workbench
set -e

cd "$(dirname "$0")/.."

echo "→ Killing any previous instances..."
pkill -9 -f "backend.main" 2>/dev/null || true
pkill -9 -f "vite"         2>/dev/null || true
pkill -9 -f "electron"     2>/dev/null || true
lsof -ti:8765 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
sleep 1

echo "→ Starting backend..."
nohup .venv/bin/python -m backend.main --host 127.0.0.1 --port 8765 > /tmp/mw-backend.log 2>&1 &

echo "→ Starting Vite..."
nohup npx vite --host 127.0.0.1 --port 5173 > /tmp/mw-vite.log 2>&1 &

echo "→ Waiting for servers..."
for i in $(seq 1 15); do
  sleep 1
  BK=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8765/health 2>/dev/null)
  VT=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/ 2>/dev/null)
  if [ "$BK" = "200" ] && [ "$VT" = "200" ]; then
    echo "  Backend ✓  Vite ✓"
    break
  fi
  echo "  waiting... ($i)"
done

echo "→ Launching Electron..."
VITE_DEV_SERVER_URL=http://127.0.0.1:5173 nohup npx electron . > /tmp/mw-electron.log 2>&1 &

echo "✓ Market Workbench started. Logs: /tmp/mw-{backend,vite,electron}.log"
