#!/usr/bin/env bash
# Free the repo-scoped Vite/Electron processes before dev.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
pkill -TERM -f "$ROOT/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron $ROOT" 2>/dev/null || true
pkill -TERM -f "vite --host 127.0.0.1 --port 5173" 2>/dev/null || true
lsof -ti:5173 | xargs kill -TERM 2>/dev/null || true
sleep 1
