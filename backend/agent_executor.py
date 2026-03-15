from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any

SETTINGS_PATH = Path(__file__).resolve().parents[1] / ".local-workbench" / "settings.json"

# job_id → running Popen
_running: dict[str, subprocess.Popen] = {}


def _load_settings() -> dict[str, Any]:
    if SETTINGS_PATH.exists():
        try:
            return json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_settings(data: dict[str, Any]) -> None:
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def get_settings() -> dict[str, Any]:
    return _load_settings()


def get_api_key() -> str:
    return _load_settings().get("openai_api_key", "")


def executor_exists(executor: str = "codex") -> bool:
    binary = "claude" if executor == "claude" else "codex"
    return shutil.which(binary) is not None


def build_command(workspace_path: Path, prompt_path: Path, executor: str = "codex") -> str:
    if executor == "claude":
        return (
            f'claude --dangerously-skip-permissions '
            f'-C "{workspace_path.as_posix()}" '
            f'-p "$(cat "{prompt_path.as_posix()}")"'
        )
    return (
        f'codex exec --full-auto '
        f'-C "{workspace_path.as_posix()}" '
        f'"$(cat "{prompt_path.as_posix()}")"'
    )


def launch_job(
    workspace_path: Path,
    prompt_path: Path,
    job_id: str,
    executor: str = "codex",
) -> str:
    """
    Launch the executor:
    - Opens a visible Terminal window (macOS) so the user can watch
    - Simultaneously tees output to logs/codex.log for in-app streaming
    """
    log_path = workspace_path / "logs" / "codex.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)

    api_key = get_api_key()
    shell_cmd = build_command(workspace_path, prompt_path, executor)
    system = platform.system().lower()

    # Full shell script: set key + run + tee output to log file
    env_prefix = f'export OPENAI_API_KEY="{api_key}" && ' if api_key else ""
    full_script = f'{env_prefix}{shell_cmd} 2>&1 | tee "{log_path.as_posix()}"'

    if "darwin" in system:
        safe = full_script.replace("\\", "\\\\").replace('"', '\\"')
        apple_script = f'tell application "Terminal" to do script "{safe}"'
        subprocess.Popen(["osascript", "-e", apple_script])
    elif "windows" in system:
        env_prefix_win = f'set OPENAI_API_KEY={api_key} && ' if api_key else ""
        bat = f'{env_prefix_win}{shell_cmd} 2>&1 | tee "{log_path}"'
        subprocess.Popen(["cmd", "/c", "start", "cmd", "/k", bat], shell=True)
    else:
        terminal = shutil.which("x-terminal-emulator") or shutil.which("gnome-terminal")
        if terminal:
            subprocess.Popen([terminal, "-e", f"bash -lc '{full_script}'"])
        else:
            subprocess.Popen(["bash", "-lc", full_script])

    return shell_cmd


# Keep old name so existing import in main.py stays valid
def launch_local_terminal(workspace_path: Path, prompt_path: Path, executor: str = "codex") -> str:
    return launch_job(workspace_path, prompt_path, "legacy", executor)


def read_job_log(log_path: Path, tail: int = 400) -> str:
    if not log_path.exists():
        return ""
    try:
        lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
        return "\n".join(lines[-tail:])
    except Exception:
        return ""
