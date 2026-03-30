# Traders Agent

Local-first Electron workbench for:

- automated macro / FX / commodity / equity updates
- natural-language report finder scaffolds
- long-form research projects with local Codex orchestration

## Stack

- Electron desktop shell
- React + Vite frontend
- Codex CLI executor abstraction for local testing
- Folder-based local workspaces under `.local-workbench/`

## Prerequisites

- Node.js 20+ and npm
- Python 3.11+ with `pip`
- Codex CLI installed and available on your `PATH`

The app can open without Python packages, but research preparation and document generation will be limited until the Python dependencies are installed.

## Install

1. Install JavaScript dependencies:

```bash
npm install
```

2. Install the Python research/runtime dependencies:

```bash
python3 -m pip install -r backend/requirements.txt
```

3. Verify Codex CLI is installed:

```bash
codex --version
```

## Run In Development

Start the full desktop app:

```bash
npm run dev
```

That runs:

- `npm run dev:web` to start Vite on `http://127.0.0.1:5173`
- `npm run dev:electron` to launch Electron after the Vite server is reachable

If you want a clean restart that also writes logs to `/tmp`, use:

```bash
./scripts/start.sh
```

Useful log files:

- `/tmp/traders-agent-vite.log`
- `/tmp/traders-agent-electron.log`

## Build

Create the production renderer build:

```bash
npm run build
```

Then launch Electron against the built files:

```bash
npm start
```

## Local Data

The app writes local project and job data under:

```text
.local-workbench/
```

Important subfolders:

- `.local-workbench/projects/` for created projects
- `.local-workbench/jobs/` for job workspaces, uploaded files, extracted text/images, logs, and results
- `.local-workbench/library/` for copied template assets
- `.local-workbench/updates/` for scheduled update runs

This folder is ignored by Git, so fresh installs start empty and local workspaces are not committed.

## Current Repo Layout

The current Electron app still uses these folders:

- `electron/` for the desktop main/preload/runtime bridge
- `src/` for the React UI
- `backend/research_prep.py` plus `backend/requirements.txt` for research workspace preparation
- `research_templates/` for the built-in research template
- `skills/equity-research/` for staged research references
- `notes/` for finder workflow notes
- `visionalpha-to-pdf/` for the VisionAlpha capture extension used by finder jobs

## Current v0.1 scope

- create projects
- register templates
- prepare research/update/finder workspaces
- stage source files and URLs into local folders
- extract PDF text and page images into the research workspace
- stage an executable Python report template plus equity research reference files
- generate prompt/context files
- launch Codex locally through the app-server flow
- append follow-up answers into a job context

## Notes

- The finder flow still depends on the local `visionalpha-to-pdf/` extension folder.
- If the Electron window opens and immediately closes during development, the first thing to check is whether Vite is actually listening on `127.0.0.1:5173`.
- If Codex is not installed or not signed in, the UI can still load, but job execution will fail until Codex is available.
