"""Playwright-based browser worker for the Report Finder tab.

Recipes are plain dicts:
    site            str   display name
    start_url       str   initial navigation target
    headless        bool  default False (visible browser)
    login           dict  {user_field, pass_field, submit, username, password}
    search          dict  {field_selector, submit_selector, query}
    results_url     str   optional explicit results page to navigate after search
    download_links  dict  {link_selector, file_types, max_files}

Downloaded files land in download_dir. Worker logs are retrievable via get_worker_log().
"""
from __future__ import annotations

import threading
from pathlib import Path
from typing import Any, Callable

_worker_threads: dict[str, threading.Thread] = {}
_worker_logs: dict[str, list[str]] = {}
_worker_status: dict[str, str] = {}  # "running" | "done" | "error"


def _log(rid: str, msg: str) -> None:
    _worker_logs.setdefault(rid, []).append(msg)


def get_worker_log(recipe_id: str) -> str:
    return "\n".join(_worker_logs.get(recipe_id, []))


def get_worker_status(recipe_id: str) -> str:
    return _worker_status.get(recipe_id, "idle")


def run_recipe_background(
    recipe: dict[str, Any],
    download_dir: Path,
    recipe_id: str,
    on_complete: Callable[[list[str]], None] | None = None,
) -> None:
    """Launch recipe in a daemon thread. Returns immediately."""
    _worker_status[recipe_id] = "running"

    def _run() -> None:
        try:
            paths = run_recipe(recipe, download_dir, recipe_id)
            _worker_status[recipe_id] = "done"
            if on_complete:
                on_complete(paths)
        except Exception as exc:
            _log(recipe_id, f"Fatal error: {exc}")
            _worker_status[recipe_id] = "error"

    t = threading.Thread(target=_run, daemon=True, name=f"recipe-{recipe_id}")
    _worker_threads[recipe_id] = t
    t.start()


def run_recipe(
    recipe: dict[str, Any],
    download_dir: Path,
    recipe_id: str = "default",
) -> list[str]:
    """Execute a browser recipe synchronously. Returns list of downloaded paths."""
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
    except ImportError:
        _log(recipe_id, "playwright not installed — run: pip install playwright && playwright install chromium")
        return []

    download_dir = Path(download_dir)
    download_dir.mkdir(parents=True, exist_ok=True)
    downloaded: list[str] = []

    site = recipe.get("site", "unknown")
    _log(recipe_id, f"Starting recipe for: {site}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=recipe.get("headless", False))
        context = browser.new_context(
            accept_downloads=True,
            viewport={"width": 1280, "height": 900},
        )
        page = context.new_page()

        try:
            # 1. Navigate
            start_url = recipe.get("start_url", "")
            if not start_url:
                _log(recipe_id, "No start_url provided in recipe")
                return []

            _log(recipe_id, f"Navigating → {start_url}")
            page.goto(start_url, timeout=30_000)
            page.wait_for_load_state("networkidle", timeout=20_000)

            # 2. Login
            login = recipe.get("login")
            if login:
                _log(recipe_id, "Logging in…")
                try:
                    if login.get("user_field") and login.get("username"):
                        page.fill(login["user_field"], login["username"])
                    if login.get("pass_field") and login.get("password"):
                        page.fill(login["pass_field"], login["password"])
                    if login.get("submit"):
                        page.click(login["submit"])
                        page.wait_for_load_state("networkidle", timeout=20_000)
                    _log(recipe_id, "Login submitted")
                except PWTimeout:
                    _log(recipe_id, "Login timed out — continuing anyway")

            # 3. Search / query
            search = recipe.get("search")
            if search:
                query = search.get("query", "")
                _log(recipe_id, f"Searching: {query!r}")
                try:
                    if search.get("field_selector"):
                        page.fill(search["field_selector"], query)
                    if search.get("submit_selector"):
                        page.click(search["submit_selector"])
                        page.wait_for_load_state("networkidle", timeout=20_000)
                except PWTimeout:
                    _log(recipe_id, "Search timed out — continuing with current page")

            # 4. Optional explicit results URL
            results_url = recipe.get("results_url")
            if results_url:
                _log(recipe_id, f"Navigating to results → {results_url}")
                page.goto(results_url, timeout=30_000)
                page.wait_for_load_state("networkidle", timeout=20_000)

            # 5. Download
            dl_cfg = recipe.get("download_links", {})
            link_sel = dl_cfg.get("link_selector", "a[href$='.pdf']")
            file_types = dl_cfg.get("file_types", [".pdf"])
            max_files = int(dl_cfg.get("max_files", 10))

            links = page.query_selector_all(link_sel)
            _log(recipe_id, f"Found {len(links)} candidate link(s)")

            for link in links[:max_files]:
                href = (link.get_attribute("href") or "").lower()
                if not any(href.endswith(ft.lower()) for ft in file_types):
                    continue
                try:
                    with page.expect_download(timeout=30_000) as dl_info:
                        link.click()
                    dl = dl_info.value
                    dest = download_dir / dl.suggested_filename
                    dl.save_as(str(dest))
                    downloaded.append(str(dest))
                    _log(recipe_id, f"Downloaded: {dest.name}")
                except Exception as exc:
                    _log(recipe_id, f"Download failed: {exc}")

        except Exception as exc:
            _log(recipe_id, f"Recipe error: {exc}")
        finally:
            browser.close()

    _log(recipe_id, f"Finished — {len(downloaded)} file(s) saved to {download_dir}")
    return downloaded
