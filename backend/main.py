from __future__ import annotations

import argparse
import json
import re
import shutil
import zipfile
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from backend.agent_executor import build_command, executor_exists, launch_local_terminal
from backend.storage import DATA_ROOT, JOB_DIR, PROJECT_DIR, TEMPLATE_DIR, copy_any, ensure_storage, read_state, write_json, write_state

try:
    from pypdf import PdfReader
except Exception:  # pragma: no cover
    PdfReader = None


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def entity_id(prefix: str, name: str) -> str:
    return f"{prefix}_{datetime.now().strftime('%Y%m%d%H%M%S')}_{slugify(name)[:36]}"


def sort_desc(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(items, key=lambda item: item.get("created_at", ""), reverse=True)


def get_state() -> dict[str, Any]:
    state = read_state()
    return {
        "data_root": DATA_ROOT.as_posix(),
        "finder_notes_path": (Path(__file__).resolve().parents[1] / "notes" / "report-finder-recipes.md").as_posix(),
        "executor_name": "Codex CLI",
        "executor_available": executor_exists(),
        "templates": sort_desc(state["templates"]),
        "projects": sort_desc(state["projects"]),
        "jobs": sort_desc(state["jobs"]),
        "update_definitions": sort_desc(state["update_definitions"]),
    }


def read_json_body(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    content_length = int(handler.headers.get("Content-Length", "0"))
    raw = handler.rfile.read(content_length) if content_length else b"{}"
    return json.loads(raw.decode("utf-8") or "{}")


def send_json(handler: BaseHTTPRequestHandler, payload: Any, status: int = 200) -> None:
    encoded = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(encoded)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    handler.end_headers()
    handler.wfile.write(encoded)


def send_error_json(handler: BaseHTTPRequestHandler, message: str, status: int = 400) -> None:
    send_json(handler, {"detail": message}, status)


def find_record(items: list[dict[str, Any]], record_id: str) -> dict[str, Any] | None:
    for item in items:
        if item["id"] == record_id:
            return item
    return None


def ensure_workspace_dirs(workspace: Path) -> dict[str, Path]:
    mapping = {
        "source_uploads": workspace / "source" / "uploads",
        "source_downloads": workspace / "source" / "downloads",
        "source_urls": workspace / "source" / "urls",
        "source_transcripts": workspace / "source" / "transcripts",
        "source_filings": workspace / "source" / "filings",
        "extracted_text": workspace / "extracted" / "text",
        "extracted_images": workspace / "extracted" / "images",
        "extracted_tables": workspace / "extracted" / "tables",
        "extracted_metadata": workspace / "extracted" / "metadata",
        "context": workspace / "context",
        "templates": workspace / "templates" / "selected",
        "generated_charts": workspace / "generated" / "charts",
        "generated_diagrams": workspace / "generated" / "diagrams",
        "generated_excel": workspace / "generated" / "excel",
        "result": workspace / "result",
        "logs": workspace / "logs",
    }
    for path in mapping.values():
        path.mkdir(parents=True, exist_ok=True)
    return mapping


def extract_pdf_text(source: Path) -> str:
    if PdfReader is None:
        return ""
    try:
        reader = PdfReader(str(source))
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception:
        return ""


def extract_text_like(source: Path) -> str:
    if source.is_dir():
        return ""
    lower = source.suffix.lower()
    if lower == ".pdf":
        return extract_pdf_text(source)
    if lower in {".txt", ".md", ".csv"}:
        return source.read_text(encoding="utf-8", errors="ignore")
    if lower in {".docx", ".pptx", ".xlsx"}:
        try:
            with zipfile.ZipFile(source) as archive:
                snippets: list[str] = []
                for member in archive.namelist():
                    if member.endswith(".xml") and ("word/" in member or "ppt/" in member or "xl/" in member):
                        snippets.append(archive.read(member).decode("utf-8", errors="ignore"))
                return "\n".join(snippets[:20])
        except Exception:
            return ""
    return ""


def build_prompt(job: dict[str, Any], template: dict[str, Any] | None) -> str:
    lines = [
        f"You are preparing a final {job['family']} deliverable in {job['output_format']} format.",
        f"Job kind: {job['kind']}",
        f"Audience: {job['audience']}",
        f"Objective: {job['objective']}",
        f"Workspace root: {job['workspace_path']}",
        f"Write completed deliverables only into: {job['result_path']}",
        "Use extracted material, source files, provider snapshots, and templates inside this workspace.",
        "If information is missing, write follow-up questions into context/questions.md and wait for answers in context/answers.md.",
        "Do not produce partial artifacts unless the prompt explicitly asks for one.",
        "If charts, diagrams, or workbooks are needed, place them in generated/ before assembling the final result.",
    ]
    if job.get("valuation_required"):
        lines.append("A valuation workbook is required; use generated/excel/ for workbook outputs.")
    if template:
        lines.append(f"Follow the selected template style: {template['name']} ({template['family']}).")
    if job.get("custom_instructions"):
        lines.append(f"Custom instructions:\n{job['custom_instructions']}")
    if job.get("question_prompts"):
        lines.append("Questions to answer in the final output:")
        lines.extend(f"- {question}" for question in job["question_prompts"])
    return "\n\n".join(lines)


def stage_template(template: dict[str, Any] | None, destination: Path) -> None:
    if not template:
        return
    source = Path(template["library_path"])
    if source.exists():
        copy_any(source, destination / source.name)


def prepare_sources(job: dict[str, Any], workspace_dirs: dict[str, Path]) -> list[dict[str, str]]:
    assets: list[dict[str, str]] = []
    for raw_path in job["source_paths"]:
        source = Path(raw_path).expanduser()
        if not source.exists():
            continue
        target = workspace_dirs["source_uploads"] / source.name
        copy_any(source, target)
        extracted = extract_text_like(source)
        if extracted:
            (workspace_dirs["extracted_text"] / f"{source.stem}.txt").write_text(extracted, encoding="utf-8")
        assets.append({"source": source.as_posix(), "copied_to": target.as_posix()})
    if job["urls"]:
        (workspace_dirs["source_urls"] / "urls.txt").write_text("\n".join(job["urls"]), encoding="utf-8")
    return assets


def create_workspace(job: dict[str, Any], template: dict[str, Any] | None) -> dict[str, Any]:
    workspace = Path(job["workspace_path"])
    dirs = ensure_workspace_dirs(workspace)
    assets = prepare_sources(job, dirs)
    stage_template(template, dirs["templates"])

    write_json(
        dirs["context"] / "intake.json",
        {
            "title": job["title"],
            "kind": job["kind"],
            "family": job["family"],
            "audience": job["audience"],
            "output_format": job["output_format"],
            "providers": job["provider_names"],
            "urls": job["urls"],
            "source_paths": job["source_paths"],
            "valuation_required": job["valuation_required"],
        },
    )
    write_json(dirs["context"] / "provider-data.json", {"providers": job["provider_names"], "status": "stubbed"})
    write_json(dirs["extracted_metadata"] / "assets.json", assets)
    prompt = build_prompt(job, template)
    (dirs["context"] / "objective.md").write_text(job["objective"], encoding="utf-8")
    (dirs["context"] / "questions.md").write_text(
        "\n".join(f"- {question}" for question in job["question_prompts"]) or "No pending questions yet.",
        encoding="utf-8",
    )
    (dirs["context"] / "answers.md").write_text("", encoding="utf-8")
    (dirs["context"] / "prompt.md").write_text(prompt, encoding="utf-8")
    (dirs["context"] / "run-codex.txt").write_text(
        build_command(workspace, dirs["context"] / "prompt.md"), encoding="utf-8"
    )
    (dirs["logs"] / "status.json").write_text(
        json.dumps({"status": job["status"], "updated_at": job["updated_at"]}, indent=2), encoding="utf-8"
    )
    job["prompt_preview"] = prompt
    return job


def create_job_record(payload: dict[str, Any]) -> dict[str, Any]:
    state = read_state()
    template = find_record(state["templates"], payload.get("template_id")) if payload.get("template_id") else None
    project = find_record(state["projects"], payload.get("project_id")) if payload.get("project_id") else None

    job_id = entity_id("job", payload["title"])
    workspace_root = JOB_DIR / job_id
    record = {
        "id": job_id,
        "title": payload["title"],
        "kind": payload["kind"],
        "family": payload["family"],
        "objective": payload["objective"],
        "audience": payload.get("audience", "traders"),
        "output_format": payload.get("output_format", "pptx"),
        "project_id": payload.get("project_id"),
        "template_id": payload.get("template_id"),
        "provider_names": payload.get("provider_names", []),
        "source_paths": payload.get("source_paths", []),
        "urls": payload.get("urls", []),
        "custom_instructions": payload.get("custom_instructions", ""),
        "question_prompts": payload.get("question_prompts", []),
        "valuation_required": bool(payload.get("valuation_required")),
        "cadence": payload.get("cadence"),
        "status": "ready",
        "workspace_path": workspace_root.as_posix(),
        "result_path": (workspace_root / "result").as_posix(),
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "prompt_preview": "",
        "question_log": [],
    }
    if project:
        linked_jobs = Path(project["root_path"]) / "linked-jobs"
        linked_jobs.mkdir(parents=True, exist_ok=True)
        (linked_jobs / f"{job_id}.txt").write_text(workspace_root.as_posix(), encoding="utf-8")

    create_workspace(record, template)
    state["jobs"].append(record)
    write_state(state)
    return record


def handle_template_register(payload: dict[str, Any]) -> tuple[dict[str, Any], int]:
    source_path = Path(payload["source_path"]).expanduser()
    if not source_path.exists():
        return {"detail": "Template source path does not exist"}, 400
    state = read_state()
    template_id = entity_id("tmpl", payload["name"])
    template_root = TEMPLATE_DIR / template_id
    template_root.mkdir(parents=True, exist_ok=True)
    library_path = template_root / source_path.name
    copy_any(source_path, library_path)
    record = {
        "id": template_id,
        "name": payload["name"],
        "family": payload.get("family", "general"),
        "output_formats": payload.get("output_formats", []),
        "source_path": source_path.as_posix(),
        "library_path": library_path.as_posix(),
        "notes": payload.get("notes", ""),
        "created_at": now_iso(),
    }
    state["templates"].append(record)
    write_state(state)
    return record, 200


def handle_project_create(payload: dict[str, Any]) -> tuple[dict[str, Any], int]:
    state = read_state()
    project_id = entity_id("proj", payload["name"])
    project_root = PROJECT_DIR / project_id
    project_root.mkdir(parents=True, exist_ok=True)
    record = {
        "id": project_id,
        "name": payload["name"],
        "objective": payload.get("objective", ""),
        "audience": payload.get("audience", "traders"),
        "family": payload.get("family", "equity-research"),
        "root_path": project_root.as_posix(),
        "created_at": now_iso(),
    }
    (project_root / "README.md").write_text(
        f"# {record['name']}\n\nObjective: {record['objective']}\n\nAudience: {record['audience']}\n",
        encoding="utf-8",
    )
    state["projects"].append(record)
    write_state(state)
    return record, 200


def handle_job_launch(job_id: str) -> tuple[dict[str, Any], int]:
    state = read_state()
    job = find_record(state["jobs"], job_id)
    if not job:
        return {"detail": "Job not found"}, 404
    if not executor_exists():
        return {"detail": "Codex CLI is not installed on this machine"}, 400
    workspace = Path(job["workspace_path"])
    prompt_path = workspace / "context" / "prompt.md"
    command = launch_local_terminal(workspace, prompt_path)
    job["status"] = "agent_running"
    job["updated_at"] = now_iso()
    (workspace / "logs" / "launch-command.txt").write_text(command, encoding="utf-8")
    (workspace / "logs" / "status.json").write_text(
        json.dumps({"status": job["status"], "updated_at": job["updated_at"]}, indent=2), encoding="utf-8"
    )
    write_state(state)
    return {"status": "launched", "command": command}, 200


def handle_job_qa(job_id: str, payload: dict[str, Any]) -> tuple[dict[str, Any], int]:
    state = read_state()
    job = find_record(state["jobs"], job_id)
    if not job:
        return {"detail": "Job not found"}, 404
    template = find_record(state["templates"], job.get("template_id")) if job.get("template_id") else None
    workspace = Path(job["workspace_path"])
    with (workspace / "context" / "answers.md").open("a", encoding="utf-8") as handle:
        handle.write(f"\n- {payload['content']}\n")
    job["question_log"].append({"role": "user", "content": payload["content"], "timestamp": now_iso()})
    job["updated_at"] = now_iso()
    job["prompt_preview"] = build_prompt(job, template)
    (workspace / "context" / "prompt.md").write_text(job["prompt_preview"], encoding="utf-8")
    write_state(state)
    return job, 200


def handle_update_definition(payload: dict[str, Any]) -> tuple[dict[str, Any], int]:
    state = read_state()
    record = {
        "id": entity_id("upd", payload["name"]),
        "name": payload["name"],
        "cadence": payload.get("cadence", "adhoc"),
        "family": payload.get("family", "macro-update"),
        "output_format": payload.get("output_format", "pdf"),
        "instruments": payload.get("instruments", []),
        "template_id": payload.get("template_id"),
        "created_at": now_iso(),
    }
    state["update_definitions"].append(record)
    write_state(state)
    return record, 200


def handle_update_run(definition_id: str) -> tuple[dict[str, Any], int]:
    state = read_state()
    definition = find_record(state["update_definitions"], definition_id)
    if not definition:
        return {"detail": "Update definition not found"}, 404
    return (
        create_job_record(
            {
                "kind": "update",
                "title": f"{definition['name']} {datetime.now().strftime('%Y-%m-%d')}",
                "family": definition["family"],
                "objective": f"Create a {definition['cadence']} update covering: {', '.join(definition['instruments'])}. Include annotated price charts, custom diagrams, and a fully polished final output.",
                "audience": "traders",
                "output_format": definition["output_format"],
                "template_id": definition.get("template_id"),
                "provider_names": ["premium-primary"],
                "question_prompts": [
                    "What changed across the tracked instruments?",
                    "Which moves are narrative noise versus actionable positioning shifts?",
                ],
                "cadence": definition["cadence"],
            }
        ),
        200,
    )


class RequestHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:  # noqa: N802
        send_json(self, {"ok": True}, 200)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/health":
            send_json(self, {"status": "ok"})
            return
        if path == "/app-state":
            send_json(self, get_state())
            return
        send_error_json(self, "Route not found", 404)

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        payload = read_json_body(self)

        if path == "/templates/register":
            response, status = handle_template_register(payload)
            send_json(self, response, status)
            return
        if path == "/projects":
            response, status = handle_project_create(payload)
            send_json(self, response, status)
            return
        if path == "/jobs":
            send_json(self, create_job_record(payload))
            return
        if path == "/update-definitions":
            response, status = handle_update_definition(payload)
            send_json(self, response, status)
            return

        job_launch = re.fullmatch(r"/jobs/([^/]+)/launch", path)
        if job_launch:
            response, status = handle_job_launch(job_launch.group(1))
            send_json(self, response, status)
            return

        job_qa = re.fullmatch(r"/jobs/([^/]+)/qa", path)
        if job_qa:
            response, status = handle_job_qa(job_qa.group(1), payload)
            send_json(self, response, status)
            return

        update_run = re.fullmatch(r"/update-definitions/([^/]+)/run", path)
        if update_run:
            response, status = handle_update_run(update_run.group(1))
            send_json(self, response, status)
            return

        send_error_json(self, "Route not found", 404)

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        return


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    ensure_storage()
    server = ThreadingHTTPServer((args.host, args.port), RequestHandler)
    print(f"backend listening on http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
