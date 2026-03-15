#!/usr/bin/env bash
# Free ports 5173 and 8765 before dev so Vite and backend can bind
pkill -9 -f "backend.main" 2>/dev/null || true
pkill -9 -f "vite"         2>/dev/null || true
pkill -9 -f "electron"     2>/dev/null || true
lsof -ti:8765 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
sleep 1
