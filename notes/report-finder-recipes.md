# Report Finder Recipe Notes

This file is the design scratchpad for wiring the `Report Finder` tab into internal browser-driven download workflows.

## Initial architecture

- Keep automation local.
- Use deterministic Playwright recipes, not open-ended browser prompting.
- Treat each site as a recipe pack with:
  - login requirements
  - search field selectors
  - result ranking rules
  - download trigger selectors
  - file naming and destination rules
  - session timeout / re-auth handling

## Suggested recipe manifest

```json
{
  "id": "visionalpha-internal",
  "name": "VisionAlpha Internal",
  "base_url": "https://...",
  "login_mode": "manual-session-or-cookie",
  "steps": [
    "open home",
    "wait for authenticated shell",
    "run query",
    "rank results",
    "download selected reports"
  ],
  "download_rules": {
    "target_folder": "source/downloads",
    "preserve_original_filename": true,
    "write_metadata_json": true
  }
}
```

## Why not agent-first browser control here

- Cheaper and more reliable if the browser interactions are deterministic.
- Better for internal sites with fragile selectors and session requirements.
- Lets the coding agent focus on ranking, summarization, and downstream synthesis once the files are local.

## Next build step

- Add a Playwright worker that accepts a saved recipe plus a natural-language query.
- Support "manual login, then continue automatically" as the default auth flow.
- Write downloaded file metadata into the active project/job workspace.
