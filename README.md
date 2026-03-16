# Market Workbench

Local-first desktop workbench for:

- automated macro / FX / commodity / equity updates
- natural-language report finder scaffolds
- long-form research projects with local Codex orchestration

## Stack

- Electron desktop shell
- React + Vite frontend
- Python standard-library local service
- Codex CLI executor abstraction for local testing
- Folder-based local workspaces under `.local-workbench/`

## Run

1. Install JS dependencies:

```bash
npm install
```

2. Install the Python research runtime dependencies:

```bash
python3 -m pip install -r backend/requirements.txt
```

3. Start the app in development:

```bash
npm run dev
```

The Electron process will also boot the local Python service automatically.

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

- Report-finder automation is scaffolded, but site-specific browser recipes are intentionally left for the next pass once your internal workflow is provided.
- The skills/tooling assumption for local testing is Codex first; the executor layer can later add Claude or another local/cloud runner.
- Outputs should be placed in each job's `result/` folder.
