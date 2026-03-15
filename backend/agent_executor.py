from __future__ import annotations

import os
import platform
import shutil
import subprocess
from pathlib import Path


def executor_exists() -> bool:
    return shutil.which("codex") is not None


def build_command(workspace_path: Path, prompt_path: Path) -> str:
    return (
        f'codex --search --dangerously-bypass-approvals-and-sandbox '
        f'-C "{workspace_path.as_posix()}" "$(cat "{prompt_path.as_posix()}")"'
    )


def launch_local_terminal(workspace_path: Path, prompt_path: Path) -> str:
    command = build_command(workspace_path, prompt_path)
    system = platform.system().lower()

    if "darwin" in system:
        safe = command.replace("\\", "\\\\").replace('"', '\\"')
        apple_script = f'tell application "Terminal" to do script "{safe}"'
        subprocess.Popen(["osascript", "-e", apple_script])
    elif "windows" in system:
        subprocess.Popen(["cmd", "/c", "start", "cmd", "/k", command], shell=True)
    else:
        terminal = shutil.which("x-terminal-emulator") or shutil.which("gnome-terminal")
        if terminal:
            subprocess.Popen([terminal, "-e", command])
        else:
            subprocess.Popen(["bash", "-lc", command])

    return command
