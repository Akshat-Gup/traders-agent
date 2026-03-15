"""Report family contracts.

Each family defines what a complete deliverable requires so the system
can validate jobs and generate appropriate prompts.
"""
from __future__ import annotations

from typing import Any


REPORT_FAMILIES: dict[str, dict[str, Any]] = {
    "equity-research": {
        "label": "Full Equity Research Report",
        "required_sections": [
            "executive_summary",
            "company_overview",
            "earnings_update",
            "investment_thesis",
            "competitive_positioning",
            "valuation_and_price_target",
            "key_risks",
            "catalysts",
        ],
        "required_visuals": [
            "price_chart",
            "revenue_breakdown",
            "valuation_comparison",
            "beat_miss_table",
            "margin_trend_chart",
        ],
        "valuation_required": True,
        "excel_workbook_required": True,
        "accepted_inputs": [
            "broker_reports",
            "research_pdfs",
            "filings",
            "transcripts",
            "spreadsheets",
            "images",
            "urls",
        ],
        "output_formats": ["pdf", "docx", "pptx"],
        "prompt_guidance": (
            "Produce a full equity research report suitable for institutional distribution. "
            "Read all broker PDFs and research reports from extracted/text/ for content, "
            "and reference extracted/images/ for charts and tables extracted from those source documents. "
            "Sections required: executive summary, company overview, latest earnings analysis with "
            "explicit beat/miss table (actual vs. Street consensus for revenue, EPS, gross margin, "
            "operating margin), Q2/forward guidance analysis, investment thesis with three supporting "
            "pillars, competitive positioning with peer comparison table, full valuation framework "
            "(DCF + comparable companies) with price target derivation and upside/downside scenario, "
            "key risks ranked by probability × impact, and near-term catalysts with timeline. "
            "Build all charts from scratch in generated/charts/ using matplotlib — do not paste images "
            "from source PDFs directly. Save the completed report to result/."
        ),
    },
    "quarterly-stock-update": {
        "label": "Post-Earnings Quarterly Update",
        "required_sections": [
            "earnings_summary",
            "beat_miss_table",
            "guidance_analysis",
            "margin_trends",
            "management_commentary",
            "updated_estimates",
            "price_target_discussion",
        ],
        "required_visuals": [
            "beat_miss_chart",
            "margin_trend_chart",
        ],
        "valuation_required": False,
        "excel_workbook_required": False,
        "accepted_inputs": [
            "broker_reports",
            "research_pdfs",
            "filings",
            "transcripts",
            "spreadsheets",
        ],
        "output_formats": ["pdf", "docx", "pptx"],
        "prompt_guidance": (
            "Produce a post-earnings quarterly update. Read uploaded broker reports and filings from "
            "extracted/text/ to extract actual results. Cover: actual vs. consensus for all key metrics "
            "(revenue, EPS, gross margin, operating margin, EBITDA), management guidance for next quarter "
            "vs. prior Street consensus, margin trend analysis with charts, notable management commentary "
            "verbatim where relevant, updated sell-side estimates, and price target implications. "
            "Save the completed update to result/."
        ),
    },
    "commodity-report": {
        "label": "Commodity Report",
        "required_sections": [
            "market_overview",
            "supply_demand_dynamics",
            "price_drivers",
            "inventory_data",
            "seasonal_patterns",
            "positioning_recommendations",
        ],
        "required_visuals": [
            "price_chart",
            "inventory_chart",
            "supply_demand_table",
        ],
        "valuation_required": False,
        "excel_workbook_required": False,
        "accepted_inputs": ["reports", "spreadsheets", "urls"],
        "output_formats": ["pdf", "docx"],
        "prompt_guidance": (
            "Produce a commodity report. Cover current market conditions, supply/demand balance, "
            "key price drivers, inventory levels and trends, seasonal patterns, and actionable "
            "positioning recommendations."
        ),
    },
    "weekly-commodity-update": {
        "label": "Weekly Commodity Update",
        "required_sections": [
            "week_in_review",
            "price_moves",
            "key_events",
            "outlook",
        ],
        "required_visuals": [
            "annotated_price_chart",
        ],
        "valuation_required": False,
        "excel_workbook_required": False,
        "accepted_inputs": ["reports", "urls"],
        "output_formats": ["pdf", "docx", "pptx"],
        "prompt_guidance": (
            "Produce a weekly commodity update. Summarize the week's price action with annotated charts, "
            "highlight key events driving moves, and provide a short-term outlook."
        ),
    },
    "case-comp": {
        "label": "Case Competition / Asset Management Presentation",
        "required_sections": [
            "executive_summary",
            "investment_recommendation",
            "thesis_and_evidence",
            "valuation",
            "risk_analysis",
            "portfolio_fit",
        ],
        "required_visuals": [
            "valuation_summary",
            "risk_reward_chart",
            "comparable_table",
        ],
        "valuation_required": True,
        "excel_workbook_required": True,
        "accepted_inputs": ["reports", "filings", "transcripts", "spreadsheets", "images", "urls"],
        "output_formats": ["pptx", "docx", "pdf"],
        "prompt_guidance": (
            "Produce a case competition / asset management style investment presentation. "
            "Structure as a professional investment recommendation with clear thesis statement, "
            "supporting quantitative and qualitative evidence, full valuation with scenario analysis, "
            "risk assessment, and portfolio fit discussion."
        ),
    },
    "macro-update": {
        "label": "Macro / Cross-Asset Daily or Weekly Recap",
        "required_sections": [
            "market_summary",
            "asset_class_review",
            "key_data_releases",
            "positioning_notes",
        ],
        "required_visuals": [
            "annotated_price_charts",
            "cross_asset_heatmap",
        ],
        "valuation_required": False,
        "excel_workbook_required": False,
        "accepted_inputs": ["urls", "broker_reports", "research_pdfs", "spreadsheets"],
        "output_formats": ["pdf", "docx", "pptx"],
        "prompt_guidance": (
            "Produce a macro / cross-asset recap. Summarize market moves across equities, fixed income, "
            "FX, and commodities. Highlight key data releases, central bank actions, and notable flows. "
            "If broker reports or research PDFs are provided, extract relevant market commentary from "
            "extracted/text/ and use it to enrich the narrative. "
            "Build annotated price charts in generated/charts/ and include positioning notes. "
            "Save the completed recap to result/."
        ),
    },
}


def get_family(family_id: str) -> dict[str, Any] | None:
    return REPORT_FAMILIES.get(family_id)


def list_families() -> list[dict[str, str]]:
    return [{"id": k, "label": v["label"]} for k, v in REPORT_FAMILIES.items()]


def get_prompt_guidance(family_id: str) -> str:
    family = REPORT_FAMILIES.get(family_id)
    if family:
        return family["prompt_guidance"]
    return ""


def validate_job_inputs(family_id: str, provided_inputs: list[str]) -> list[str]:
    """Returns list of warnings if inputs don't match family expectations."""
    family = REPORT_FAMILIES.get(family_id)
    if not family:
        return [f"Unknown report family: {family_id}"]
    warnings = []
    if family["valuation_required"] and "spreadsheets" not in provided_inputs:
        warnings.append(f"Family '{family_id}' expects valuation; consider providing spreadsheet data.")
    return warnings
