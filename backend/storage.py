from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / ".local-workbench"
STATE_FILE = DATA_ROOT / "state.json"
LIBRARY_DIR = DATA_ROOT / "library"
TEMPLATE_DIR = LIBRARY_DIR / "templates"
PROJECT_DIR = DATA_ROOT / "projects"
JOB_DIR = DATA_ROOT / "jobs"
UPDATE_DIR = DATA_ROOT / "updates"


def ensure_storage() -> None:
    for path in [DATA_ROOT, LIBRARY_DIR, TEMPLATE_DIR, PROJECT_DIR, JOB_DIR, UPDATE_DIR]:
        path.mkdir(parents=True, exist_ok=True)

    if not STATE_FILE.exists():
        STATE_FILE.write_text(
            json.dumps(
                {
                    "templates": [],
                    "projects": [],
                    "jobs": [],
                    "update_definitions": [],
                },
                indent=2,
            ),
            encoding="utf-8",
        )


def read_state() -> dict[str, Any]:
    ensure_storage()
    return json.loads(STATE_FILE.read_text(encoding="utf-8"))


def write_state(payload: dict[str, Any]) -> None:
    ensure_storage()
    STATE_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def copy_any(source: Path, destination: Path) -> None:
    if source.is_dir():
        shutil.copytree(source, destination, dirs_exist_ok=True)
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
