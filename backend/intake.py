"""Interactive intake question generation.

Uses gpt-4o-mini (via stored API key) to produce contextual clarifying questions
with clickable options before a job is sent to Codex.  Falls back to hard-coded
family defaults when the API key is missing or the call fails.
"""
from __future__ import annotations

import json
from typing import Any

from backend.agent_executor import get_api_key

# ── Hard-coded per-family seed questions ─────────────────────────────────────

_FAMILY_QUESTIONS: dict[str, list[dict[str, Any]]] = {
    "equity-research": [
        {
            "id": "audience",
            "text": "Who is this report for?",
            "multi": False,
            "options": [
                {"id": "pm",     "label": "Portfolio Manager"},
                {"id": "banker", "label": "Private Banker"},
                {"id": "trader", "label": "Trader / Sales"},
                {"id": "retail", "label": "Retail / General"},
            ],
        },
        {
            "id": "depth",
            "text": "How deep should the report be?",
            "multi": False,
            "options": [
                {"id": "brief",      "label": "Brief note (5–8 pages)"},
                {"id": "standard",   "label": "Standard research (15–20 pages)"},
                {"id": "initiation", "label": "Full initiation (30–50 pages)"},
            ],
        },
        {
            "id": "valuation",
            "text": "Valuation model?",
            "multi": False,
            "options": [
                {"id": "dcf_comps",  "label": "DCF + Comps + Excel workbook"},
                {"id": "comps_only", "label": "Comps table only"},
                {"id": "none",       "label": "No formal valuation"},
            ],
        },
        {
            "id": "focus",
            "text": "Primary focus areas?",
            "multi": True,
            "options": [
                {"id": "earnings",    "label": "Latest earnings"},
                {"id": "thesis",      "label": "Investment thesis"},
                {"id": "competitive", "label": "Competitive positioning"},
                {"id": "catalysts",   "label": "Near-term catalysts"},
                {"id": "risks",       "label": "Key risks"},
                {"id": "macro",       "label": "Macro backdrop"},
            ],
        },
        {
            "id": "output_format",
            "text": "Preferred output?",
            "multi": False,
            "options": [
                {"id": "docx",       "label": "DOCX report"},
                {"id": "pptx",       "label": "PowerPoint deck"},
                {"id": "pdf",        "label": "PDF"},
                {"id": "docx_xlsx",  "label": "DOCX + Excel model"},
            ],
        },
    ],
    "quarterly-stock-update": [
        {
            "id": "audience",
            "text": "Audience?",
            "multi": False,
            "options": [
                {"id": "pm",     "label": "Portfolio Manager"},
                {"id": "banker", "label": "Private Banker"},
                {"id": "trader", "label": "Trader"},
            ],
        },
        {
            "id": "focus",
            "text": "What to emphasise?",
            "multi": True,
            "options": [
                {"id": "beat_miss",         "label": "Beat / miss vs. consensus"},
                {"id": "guidance",          "label": "Forward guidance changes"},
                {"id": "mgmt_commentary",   "label": "Management commentary"},
                {"id": "estimate_revision", "label": "Estimate revisions"},
                {"id": "thesis_update",     "label": "Thesis update"},
            ],
        },
        {
            "id": "output_format",
            "text": "Output format?",
            "multi": False,
            "options": [
                {"id": "docx", "label": "Short DOCX note"},
                {"id": "pdf",  "label": "PDF"},
                {"id": "pptx", "label": "Slide deck"},
            ],
        },
    ],
    "commodity-report": [
        {
            "id": "commodity",
            "text": "Which commodity?",
            "multi": False,
            "options": [
                {"id": "crude",  "label": "Crude oil (WTI / Brent)"},
                {"id": "natgas", "label": "Natural gas"},
                {"id": "metals", "label": "Metals (gold, silver, copper)"},
                {"id": "agri",   "label": "Agriculture"},
                {"id": "other",  "label": "Other — see objective"},
            ],
        },
        {
            "id": "time_horizon",
            "text": "Time horizon?",
            "multi": False,
            "options": [
                {"id": "weekly",    "label": "Weekly"},
                {"id": "monthly",   "label": "Monthly"},
                {"id": "quarterly", "label": "Quarterly"},
            ],
        },
        {
            "id": "output_format",
            "text": "Output format?",
            "multi": False,
            "options": [
                {"id": "pdf",  "label": "PDF"},
                {"id": "docx", "label": "DOCX"},
                {"id": "pptx", "label": "Slides"},
            ],
        },
    ],
    "weekly-commodity-update": [
        {
            "id": "commodity",
            "text": "Which commodity / market?",
            "multi": False,
            "options": [
                {"id": "crude",  "label": "Crude oil"},
                {"id": "natgas", "label": "Natural gas"},
                {"id": "metals", "label": "Metals"},
                {"id": "agri",   "label": "Agriculture"},
            ],
        },
        {
            "id": "output_format",
            "text": "Output format?",
            "multi": False,
            "options": [
                {"id": "pdf",  "label": "PDF"},
                {"id": "docx", "label": "DOCX"},
                {"id": "pptx", "label": "Slides"},
            ],
        },
    ],
    "macro-update": [
        {
            "id": "asset_classes",
            "text": "Asset classes to cover?",
            "multi": True,
            "options": [
                {"id": "equities",     "label": "Equities"},
                {"id": "fixed_income", "label": "Fixed Income / Rates"},
                {"id": "fx",           "label": "FX"},
                {"id": "commodities",  "label": "Commodities"},
                {"id": "credit",       "label": "Credit"},
            ],
        },
        {
            "id": "cadence",
            "text": "Cadence?",
            "multi": False,
            "options": [
                {"id": "daily",  "label": "Daily"},
                {"id": "weekly", "label": "Weekly"},
                {"id": "adhoc",  "label": "Ad hoc"},
            ],
        },
        {
            "id": "output_format",
            "text": "Output format?",
            "multi": False,
            "options": [
                {"id": "pdf",  "label": "PDF"},
                {"id": "pptx", "label": "Slides"},
                {"id": "docx", "label": "DOCX note"},
            ],
        },
    ],
    "case-comp": [
        {
            "id": "recommendation",
            "text": "Investment stance?",
            "multi": False,
            "options": [
                {"id": "long",      "label": "Long / Buy"},
                {"id": "short",     "label": "Short / Sell"},
                {"id": "undecided", "label": "Let the analysis decide"},
            ],
        },
        {
            "id": "depth",
            "text": "Deck length?",
            "multi": False,
            "options": [
                {"id": "standard", "label": "Standard (15–20 slides)"},
                {"id": "full",     "label": "Full (30+ slides)"},
            ],
        },
        {
            "id": "include_excel",
            "text": "Include Excel model?",
            "multi": False,
            "options": [
                {"id": "yes", "label": "Yes — DCF + Comps"},
                {"id": "no",  "label": "No — slides only"},
            ],
        },
    ],
}

_DEFAULT_QUESTIONS: list[dict[str, Any]] = [
    {
        "id": "audience",
        "text": "Who is this for?",
        "multi": False,
        "options": [
            {"id": "pm",      "label": "Portfolio Manager"},
            {"id": "banker",  "label": "Banker"},
            {"id": "trader",  "label": "Trader"},
            {"id": "general", "label": "General"},
        ],
    },
    {
        "id": "output_format",
        "text": "Output format?",
        "multi": False,
        "options": [
            {"id": "docx", "label": "DOCX"},
            {"id": "pdf",  "label": "PDF"},
            {"id": "pptx", "label": "PPTX"},
        ],
    },
]


# ── OpenAI enrichment ─────────────────────────────────────────────────────────

def _ai_questions(
    objective: str,
    family: str,
    seed: list[dict[str, Any]],
    api_key: str,
) -> list[dict[str, Any]]:
    """Call gpt-4o-mini to contextualise the seed questions for this specific objective."""
    try:
        import openai
        client = openai.OpenAI(api_key=api_key)
        system = (
            "You generate concise intake questions for a finance report workflow. "
            "Return JSON: {\"questions\": [...]}. Each question: "
            "id (snake_case), text (short question, ≤10 words), multi (bool), "
            "options ([{id, label}], 2–6 options, labels ≤5 words). "
            "Minimum 3 questions, maximum 5. Adapt to the user's exact objective."
        )
        user_msg = (
            f"Report family: {family}\n"
            f"User objective: {objective}\n\n"
            f"Seed questions to refine or replace:\n{json.dumps(seed, indent=2)}"
        )
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": user_msg},
            ],
            temperature=0.25,
            max_tokens=900,
        )
        result = json.loads(resp.choices[0].message.content)
        qs = result.get("questions", [])
        if qs and isinstance(qs, list) and len(qs) >= 2:
            return qs
    except Exception as exc:
        print(f"[intake] OpenAI question generation failed: {exc}")
    return seed


# ── Public API ────────────────────────────────────────────────────────────────

def get_intake_questions(
    objective: str,
    family: str,
    use_ai: bool = True,
) -> list[dict[str, Any]]:
    """Return intake questions, optionally enriched by gpt-4o-mini."""
    seed = _FAMILY_QUESTIONS.get(family, _DEFAULT_QUESTIONS)
    api_key = get_api_key()
    if use_ai and api_key:
        return _ai_questions(objective, family, seed, api_key)
    return seed


def answers_to_instructions(answers: dict[str, list[str]]) -> str:
    """Convert user's intake answers into a plain-text instruction block for the prompt."""
    lines = ["User preferences from intake:"]
    label_map = {
        "audience":       "Audience",
        "depth":          "Report depth",
        "valuation":      "Valuation",
        "focus":          "Focus areas",
        "output_format":  "Output format",
        "time_horizon":   "Time horizon",
        "commodity":      "Commodity",
        "asset_classes":  "Asset classes",
        "cadence":        "Cadence",
        "recommendation": "Investment stance",
        "include_excel":  "Excel model",
    }
    for qid, selected in answers.items():
        label = label_map.get(qid, qid.replace("_", " ").title())
        lines.append(f"- {label}: {', '.join(selected)}")
    return "\n".join(lines)
