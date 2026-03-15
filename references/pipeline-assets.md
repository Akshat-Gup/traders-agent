# Pipeline Reference Assets

The legacy reference assets for the finance-report pipeline now live under `market_workbench/` at the repo root. That folder is intentionally ignored by Git so the main app repo stays code-focused while we keep the older pipeline around as a local reference snapshot.

## Canonical reference location

- `market_workbench/`
  - Local snapshot of the earlier Market Workbench / Broadcom-oriented pipeline, including the old scripts, uploaded reports, extracted artifacts, plugins, and generated outputs.

## Where the reference material lives

All of the paths below are relative to `market_workbench/`.

- `scripts/generate_broadcom_report.py`
  - Main legacy example for the handcrafted Broadcom report pipeline.
- `scripts/generate_broadcom_report_v1.py`
- `scripts/generate_broadcom_report_v2.py`
  - Earlier iterations of the same report-assembly workflow.
- `report/`
  - Uploaded broker PDFs and source research reports used as example inputs.
- `tmp/pdfs/`
  - Intermediate extraction artifacts: page previews, OCR covers, crops, source-page screenshots, contact sheets, and key-report extracts.
- `tmp/docs/`
  - Generated charts and image crops used in the original document and presentation assembly flow.
- `tmp/financial-services-plugins/`
  - Reference copy of the finance skill and plugin library that informed the original agent workflow.
- `output/`
  - Example final outputs from the older pipeline, including rendered DOCX and PDF artifacts.

## Why these are ignored now

These folders contain large binary files, generated artifacts, and local-only working data. Keeping the entire `market_workbench/` snapshot out of Git makes the repo much easier to clone, review, and push.

## Recommended usage

- Treat `market_workbench/scripts/` as the source-code reference for how the old pipeline worked.
- Treat `market_workbench/report/`, `market_workbench/tmp/`, and `market_workbench/output/` as local sample-data and reference areas.
- If we need a durable subset in Git later, create a curated `examples/` folder with only:
  - 1-3 representative input PDFs
  - a few key extracted images
  - one final output example
  - one short README explaining the path from input to output

## Safe next step

If you want, I can next create a slim tracked `examples/` package from these local assets so the repo keeps a usable reference pipeline without dragging in the entire working archive.
