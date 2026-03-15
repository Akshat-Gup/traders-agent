#!/bin/zsh

set -euo pipefail

if [[ -x ".venv/bin/python" ]]; then
  exec ./.venv/bin/python -m backend.main --host 127.0.0.1 --port 8765
fi

exec python3 -m backend.main --host 127.0.0.1 --port 8765
