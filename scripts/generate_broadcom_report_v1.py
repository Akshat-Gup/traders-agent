from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pypdfium2 as pdfium
from PIL import Image
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image as RLImage,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
TMP_DIR = ROOT / "tmp" / "docs"
SOURCE_IMG_DIR = ROOT / "tmp" / "pdfs" / "source_pages"
CROP_DIR = TMP_DIR / "crops"
CHART_DIR = TMP_DIR / "charts"
PDF_DIR = ROOT / "output" / "pdf"
DOC_DIR = ROOT / "output" / "doc"
PDF_PATH = PDF_DIR / "broadcom_equity_research_report.pdf"
DOCX_PATH = DOC_DIR / "broadcom_equity_research_report.docx"

TITLE = "Broadcom Inc. (NASDAQ: AVGO)"
SUBTITLE = "Comprehensive Earnings Update for Private Bankers"
REPORT_DATE = "14 March 2026"
PRICE_DATE = "04 March 2026"

CURRENT_PRICE = 317.53
TARGET_PRICE = 500.00
UPSIDE = TARGET_PRICE / CURRENT_PRICE - 1.0
MARKET_CAP_B = 1577.8
ENTERPRISE_VALUE_B = 1613.0
NET_DEBT_B = 51.9
DIVIDEND_YIELD = 0.007
DIVIDEND_Q = 0.65

NAVY = "#10324A"
BLUE = "#2F6EA0"
TEAL = "#4F96AE"
LIGHT = "#DBE8F3"
LIGHTER = "#EEF4F8"
GOLD = "#B68A3A"
RED = "#C45454"
GRAY = "#5B6670"
DARK = "#1B1F24"

Q1_ACTUALS = {
    "revenue": 19.3,
    "ai_revenue": 8.4,
    "semi": 12.5,
    "software": 6.8,
    "gross_margin": 77.0,
    "op_margin": 66.4,
    "ebitda_margin": 68.0,
    "eps": 2.05,
    "cfo": 8.3,
    "capex": 0.25,
    "buybacks": 7.9,
    "dividends": 3.0,
    "cash": 14.2,
}

STREET = {
    "revenue": 19.2,
    "ai_revenue": 8.2,
    "semi": 12.3,
    "software": 6.9,
    "gross_margin": 76.8,
    "op_margin": 65.5,
    "ebitda_margin_q2": 67.1,
    "eps": 2.03,
    "q2_revenue": 20.5,
    "q2_ai_revenue": 9.3,
}

Q2_GUIDE = {
    "revenue": 22.0,
    "ai_revenue": 10.7,
    "non_ai_semi": 4.1,
    "software": 7.2,
    "ebitda_margin": 68.0,
}

ANNUAL_MODEL = {
    "FY25A": {"semis": 36.9, "software": 27.0, "revenue": 63.9, "eps": 6.82, "fcf": 26.9},
    "FY26E": {"semis": 63.0, "software": 29.5, "revenue": 92.5, "eps": 12.80, "fcf": 34.5},
    "FY27E": {"semis": 87.0, "software": 34.0, "revenue": 121.0, "eps": 20.00, "fcf": 45.0},
}

BROKER_PTS = [
    ("HSBC", 535),
    ("J.P. Morgan", 500),
    ("House view", 500),
    ("UBS", 475),
    ("Morgan Stanley", 470),
    ("Broad broker floor", 450),
]

BROKER_EPS_27 = [
    ("UBS", 22.76),
    ("House view", 20.00),
    ("J.P. Morgan", 19.61),
    ("Morgan Stanley", 17.98),
    ("HSBC", 16.72),
]

FY27_AI_FRAMES = [
    ("Mgmt floor", 100),
    ("JPM", 120),
    ("UBS", 130),
    ("Jefferies upside", 200),
]

BROKER_GRID = [
    ["Broker", "PT", "Key message"],
    ["J.P. Morgan", "$500", "AI revenue >$65bn in FY26 and >$100bn in FY27; OpenAI now qualified; networking mix rising."],
    ["UBS", "$475", "Margin debate improved; >$130bn FY27 AI revenue is plausible if TPU and networking scale together."],
    ["Morgan Stanley", "$470", "Visibility improved, rack-margin fears receding, and risk/reward still favors upside."],
    ["Goldman Sachs", "Buy", "Guidance and customer disclosures should settle key investor debates and support stock appreciation."],
    ["Jefferies", "Bullish / Top Pick", "10GW framework suggests current >$100bn FY27 AI view may still prove conservative."],
    ["HSBC", "$535", "Street is still underestimating ASIC plus networking upside and FY26 EPS could approach FY27 consensus."],
]

ESTIMATE_MATRIX = [
    ["Metric", "FY25A", "FY26E", "FY27E"],
    ["Revenue ($bn)", "63.9", "92.5", "121.0"],
    ["Revenue growth", "23.9%", "44.8%", "30.8%"],
    ["Semiconductor revenue ($bn)", "36.9", "63.0", "87.0"],
    ["Software revenue ($bn)", "27.0", "29.5", "34.0"],
    ["AI revenue ($bn)", "19.0", "65.0", "110.0"],
    ["Adj. EBITDA margin", "67.6%", "68.2%", "68.0%"],
    ["Adj. EPS ($)", "6.82", "12.80", "20.00"],
    ["Free cash flow ($bn)", "26.9", "34.5", "45.0"],
]

SOURCE_MATRIX = [
    ["Source", "Use in this report"],
    ["J.P. Morgan full take (5 Mar 2026)", "Primary factual base for quarter, AI revenue path, customer ramps, and FY26-FY27 EPS framing."],
    ["UBS strong results note (5 Mar 2026)", "Margin interpretation, AI networking mix, and higher-end FY27 AI revenue debate."],
    ["Morgan Stanley AI momentum builds (5 Mar 2026)", "Risk/reward framework, valuation ranges, and scenario mapping."],
    ["Goldman Sachs first take / follow-up", "Street reaction framing and debate resolution around customers and guidance."],
    ["Jefferies strong 2027 outlook", "Revenue-per-GW and networking share upside case."],
    ["HSBC potent mix of ASIC and networking upside", "High-end ASIC, CoWoS and networking TAM assumptions."],
    ["UBS software deep dive / SOTP preview", "Software renewal and valuation-backstop risk discussion."],
]

THESIS_MATRIX = [
    ["Thesis pillar", "What supports it now", "What would weaken it"],
    ["AI platform breadth", "Six-customer framework, stronger networking mix, and multiple programs beyond Google.", "A material delay in Meta, OpenAI or Anthropic ramps."],
    ["Rising earnings power", "Broker estimates moved up, Q2 guide beat, and FY27 AI revenue floor is now explicit.", "Guide cuts or lower AI revenue conversion into EPS."],
    ["Cash flow support", "Software stability, large buybacks, and modest capex intensity relative to operating cash flow.", "Software churn or a sharp increase in capital intensity."],
]

DEBATE_MATRIX = [
    ["Debate", "Current broker read-through", "House take"],
    ["How big can FY27 AI revenue get?", "Mgmt says >$100bn; JPM $120bn; UBS >$130bn; Jefferies sees upside far above that.", "Use $110bn in our base case and leave upside for execution."],
    ["Will rack mix hurt margins?", "Concern has eased materially after the quarter.", "Still watch closely, but no longer a thesis-breaker."],
    ["Does software deserve a premium multiple?", "Views diverge; UBS is the most explicit on churn and renewal risks.", "Software is a backstop, not the main driver of upside."],
    ["Is valuation already full?", "Depends on whose FY27 EPS you believe.", "Not full if Broadcom delivers near current AI and cash-return expectations."],
]

CLIENT_FIT = [
    ["Client-use appendix", "Practical interpretation"],
    ["Who this suits", "Growth-oriented clients who want AI exposure backed by cash flow and capital returns."],
    ["Who should be careful", "Clients needing low volatility or immediate certainty on hyperscaler spending trends."],
    ["Best holding period", "12-24 months so FY27 deployment visibility can develop."],
    ["What would make us more bullish", "Evidence that networking mix and customer breadth continue to expand without margin leakage."],
    ["What would make us less bullish", "AI demand pauses, software renewals deteriorate, or buybacks slow materially."],
]

MONITORING_FRAME = [
    ["What to monitor next", "Why it matters", "What would be positive"],
    ["AI revenue mix", "This will show whether networking continues to widen the moat and improve quality of growth.", "Networking remains close to or above 40% of AI revenue."],
    ["Customer breadth", "The stock will rerate more easily if investors believe Broadcom is not dependent on one customer family.", "OpenAI, Meta and Anthropic commentary becomes more concrete."],
    ["Software renewal health", "This is the main cushion under the valuation if AI spending volatility rises.", "Renewals stabilize and churn concerns prove manageable."],
    ["Capital returns", "Buybacks and dividends make the stock easier to own in diversified client portfolios.", "Repurchases remain aggressive without hurting leverage discipline."],
]

ROBOTICS_LINK = [
    ["Robotics AI layer", "Why it matters", "Broadcom exposure"],
    ["Compute infrastructure", "Large robotics foundation models need the same high-end clusters used for frontier LLM training.", "Direct via custom XPU / ASIC programs and related silicon IP."],
    ["High-speed networking", "Simulation, sensor fusion and video-heavy robot training move enormous amounts of data between chips and racks.", "Direct and significant via switching, interconnect and networking silicon."],
    ["Data layer", "Proprietary video, factory and sensor data are major moats, but difficult to access in public markets.", "Mostly indirect; Broadcom benefits when data volumes force more infrastructure spend."],
    ["Simulation / digital twins", "Robotics developers increasingly train in sim before deployment in the physical world.", "Indirect; more simulation means more compute and networking demand."],
]


def ensure_dirs() -> None:
    for path in (TMP_DIR, SOURCE_IMG_DIR, CROP_DIR, CHART_DIR, PDF_DIR, DOC_DIR):
        path.mkdir(parents=True, exist_ok=True)


def style_matplotlib() -> None:
    plt.style.use("default")
    plt.rcParams.update(
        {
            "figure.facecolor": "white",
            "axes.facecolor": "white",
            "axes.edgecolor": "#C9D5DF",
            "axes.labelcolor": DARK,
            "text.color": DARK,
            "axes.titleweight": "bold",
            "font.size": 10,
            "font.family": "DejaVu Serif",
        }
    )


def save_barh_chart(path: Path, title: str, subtitle: str, labels: list[str], values: list[float], colors_list: list[str]) -> None:
    fig, ax = plt.subplots(figsize=(8.4, 3.8))
    y = np.arange(len(labels))
    ax.barh(y, values, color=colors_list)
    ax.set_yticks(y, labels)
    ax.invert_yaxis()
    ax.set_title(title, loc="left", fontsize=15, color=NAVY, pad=18)
    ax.text(0.0, 1.03, subtitle, transform=ax.transAxes, fontsize=9, color=GRAY)
    ax.grid(axis="x", color="#DCE4EA", linewidth=0.8)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    for idx, value in enumerate(values):
        ax.text(value + max(values) * 0.01, idx, f"${value:.0f}", va="center", fontsize=10, color=NAVY)
    fig.tight_layout()
    fig.savefig(path, dpi=220, bbox_inches="tight")
    plt.close(fig)


def save_grouped_bar_chart(path: Path, title: str, subtitle: str, categories: list[str], left_vals: list[float], right_vals: list[float], left_label: str, right_label: str) -> None:
    x = np.arange(len(categories))
    width = 0.36
    fig, ax = plt.subplots(figsize=(8.4, 4.0))
    ax.bar(x - width / 2, left_vals, width, label=left_label, color=BLUE)
    ax.bar(x + width / 2, right_vals, width, label=right_label, color=TEAL)
    ax.set_xticks(x, categories)
    ax.set_title(title, loc="left", fontsize=15, color=NAVY, pad=18)
    ax.text(0.0, 1.03, subtitle, transform=ax.transAxes, fontsize=9, color=GRAY)
    ax.grid(axis="y", color="#DCE4EA", linewidth=0.8)
    ax.legend(frameon=False, loc="upper left")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    for bars in ax.containers:
        ax.bar_label(bars, fmt="%.1f", padding=3, fontsize=9)
    fig.tight_layout()
    fig.savefig(path, dpi=220, bbox_inches="tight")
    plt.close(fig)


def save_stacked_bar_chart(path: Path, title: str, subtitle: str, categories: list[str], lower_vals: list[float], upper_vals: list[float], lower_label: str, upper_label: str) -> None:
    x = np.arange(len(categories))
    fig, ax = plt.subplots(figsize=(8.4, 4.0))
    ax.bar(x, lower_vals, label=lower_label, color=BLUE)
    ax.bar(x, upper_vals, bottom=lower_vals, label=upper_label, color=TEAL)
    ax.set_xticks(x, categories)
    ax.set_title(title, loc="left", fontsize=15, color=NAVY, pad=18)
    ax.text(0.0, 1.03, subtitle, transform=ax.transAxes, fontsize=9, color=GRAY)
    ax.grid(axis="y", color="#DCE4EA", linewidth=0.8)
    ax.legend(frameon=False, loc="upper left")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    for idx, total in enumerate(np.array(lower_vals) + np.array(upper_vals)):
        ax.text(idx, total + max(total * 0.015, 0.12), f"{total:.1f}", ha="center", fontsize=9, color=NAVY)
    fig.tight_layout()
    fig.savefig(path, dpi=220, bbox_inches="tight")
    plt.close(fig)


def save_scenario_chart(path: Path, title: str, subtitle: str, labels: list[str], values: list[float], current_price: float) -> None:
    fig, ax = plt.subplots(figsize=(8.4, 4.0))
    colors_list = [RED, BLUE, GOLD]
    ax.bar(labels, values, color=colors_list)
    ax.axhline(current_price, color="#666666", linestyle="--", linewidth=1.2, label=f"Current ${current_price:.0f}")
    ax.set_title(title, loc="left", fontsize=15, color=NAVY, pad=18)
    ax.text(0.0, 1.03, subtitle, transform=ax.transAxes, fontsize=9, color=GRAY)
    ax.grid(axis="y", color="#DCE4EA", linewidth=0.8)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.legend(frameon=False, loc="upper left")
    for idx, value in enumerate(values):
        ax.text(idx, value + 8, f"${value:.0f}", ha="center", fontsize=10, color=NAVY)
    fig.tight_layout()
    fig.savefig(path, dpi=220, bbox_inches="tight")
    plt.close(fig)


def save_capital_chart(path: Path) -> None:
    labels = ["CFO", "Capex", "Buybacks", "Dividends"]
    values = [Q1_ACTUALS["cfo"], Q1_ACTUALS["capex"], Q1_ACTUALS["buybacks"], Q1_ACTUALS["dividends"]]
    fig, ax = plt.subplots(figsize=(8.4, 4.0))
    ax.bar(labels, values, color=[BLUE, TEAL, GOLD, RED])
    ax.set_title("Q1 FY26 cash generation and capital return", loc="left", fontsize=15, color=NAVY, pad=18)
    ax.text(0.0, 1.03, "Cash from operations easily covered repurchases and dividends", transform=ax.transAxes, fontsize=9, color=GRAY)
    ax.grid(axis="y", color="#DCE4EA", linewidth=0.8)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    for idx, value in enumerate(values):
        ax.text(idx, value + 0.22, f"${value:.2f}bn" if value < 1 else f"${value:.1f}bn", ha="center", fontsize=10, color=NAVY)
    fig.tight_layout()
    fig.savefig(path, dpi=220, bbox_inches="tight")
    plt.close(fig)


def render_pdf_page(pdf_path: Path, page_no: int, out_path: Path) -> None:
    pdf = pdfium.PdfDocument(str(pdf_path))
    pdf[page_no - 1].render(scale=2.2).to_pil().save(out_path)


def ensure_source_page(name: str, pdf_rel: str, page_no: int) -> Path:
    out_path = SOURCE_IMG_DIR / name
    if not out_path.exists():
        render_pdf_page(ROOT / pdf_rel, page_no, out_path)
    return out_path


def crop_source_charts() -> None:
    jpm_page = ensure_source_page("jpm_page2.png", "report/jp-broadcom-fulltake.pdf", 2)
    ms_page = ensure_source_page("ms_page4.png", "report/VisionAlpha_Report_1773474642089.pdf", 4)
    ubs_page = ensure_source_page("ubs_p4.png", "report/VisionAlpha_Report_1773474623069.pdf", 4)
    hsbc_page = ensure_source_page("hsbc_p4.png", "report/VisionAlpha_Report_1773474758155.pdf", 4)
    jeff_page = ensure_source_page("jeff_va_p4.png", "report/VisionAlpha_Report_1773474668082.pdf", 4)
    jpm_crop = CROP_DIR / "jpm_crop_metrics.png"
    ms_crop = CROP_DIR / "ms_crop_risk_reward.png"
    ubs_crop = CROP_DIR / "ubs_crop_tpu.png"
    hsbc_crop = CROP_DIR / "hsbc_crop_revisions.png"
    jeff_crop = CROP_DIR / "jeff_crop_charts.png"
    if not jpm_crop.exists():
        img = Image.open(jpm_page)
        img.crop((120, 380, 1480, 2600)).save(jpm_crop)
    if not ms_crop.exists():
        img = Image.open(ms_page)
        img.crop((120, 620, 1940, 2850)).save(ms_crop)
    if not ubs_crop.exists():
        img = Image.open(ubs_page)
        img.crop((90, 120, 2340, 2380)).save(ubs_crop)
    if not hsbc_crop.exists():
        img = Image.open(hsbc_page)
        img.crop((90, 220, 2330, 3180)).save(hsbc_crop)
    if not jeff_crop.exists():
        img = Image.open(jeff_page)
        img.crop((80, 230, 2290, 2540)).save(jeff_crop)


def generate_charts() -> dict[str, Path]:
    style_matplotlib()
    charts = {
        "targets": CHART_DIR / "price_targets.png",
        "rev_ai": CHART_DIR / "revenue_ai_progression.png",
        "q1_mix": CHART_DIR / "q1_revenue_mix.png",
        "ai_mix": CHART_DIR / "ai_mix_q1_q2.png",
        "ai_frames": CHART_DIR / "fy27_ai_frameworks.png",
        "cash": CHART_DIR / "cash_returns.png",
        "annual_mix": CHART_DIR / "annual_mix.png",
        "scenario": CHART_DIR / "valuation_scenarios.png",
        "broker_eps": CHART_DIR / "broker_eps_fy27.png",
    }
    save_barh_chart(
        charts["targets"],
        "Price targets sampled from the broker pack",
        "Broadcom remains broadly rated bullish after the March quarter",
        [x[0] for x in BROKER_PTS],
        [x[1] for x in BROKER_PTS],
        [GOLD, BLUE, NAVY, TEAL, LIGHT, "#B8CBD9"],
    )
    save_grouped_bar_chart(
        charts["rev_ai"],
        "Revenue and AI revenue are stepping up together",
        "Q1 FY26 actuals and Q2 FY26 guidance versus prior-year quarter",
        ["Q1 FY25A", "Q1 FY26A", "Q2 FY26G"],
        [14.9, 19.3, 22.0],
        [4.1, 8.4, 10.7],
        "Total revenue",
        "AI revenue",
    )
    save_stacked_bar_chart(
        charts["q1_mix"],
        "Q1 FY26 revenue mix",
        "AI is already the largest piece of the Broadcom story",
        ["Q1 FY26"],
        [5.63 + 2.77, ][:1],
        [4.12 + 6.80, ][:1],
        "AI revenue",
        "Non-AI semi + software",
    )
    save_stacked_bar_chart(
        charts["ai_mix"],
        "AI mix is shifting toward networking",
        "One-third of AI revenue in Q1; management says 40% in Q2",
        ["Q1 FY26A", "Q2 FY26G"],
        [5.63, 6.42],
        [2.77, 4.28],
        "AI compute / ASIC",
        "AI networking",
    )
    save_barh_chart(
        charts["ai_frames"],
        "FY27 AI revenue frameworks in the source pack",
        "Management floor sits materially below the most bullish broker views",
        [x[0] for x in FY27_AI_FRAMES],
        [x[1] for x in FY27_AI_FRAMES],
        [BLUE, TEAL, GOLD, NAVY],
    )
    save_capital_chart(charts["cash"])
    save_stacked_bar_chart(
        charts["annual_mix"],
        "Our revenue mix view: AI semis drive growth, software anchors cash flow",
        "Amounts in $bn; semis include both AI and non-AI semiconductor solutions",
        list(ANNUAL_MODEL.keys()),
        [ANNUAL_MODEL[k]["semis"] for k in ANNUAL_MODEL],
        [ANNUAL_MODEL[k]["software"] for k in ANNUAL_MODEL],
        "Semiconductor solutions",
        "Infrastructure software",
    )
    save_scenario_chart(
        charts["scenario"],
        "12-month valuation scenarios",
        "Base case uses 25x FY27E adjusted EPS of $20.00",
        ["Bear", "Base", "Bull"],
        [360, 500, 575],
        CURRENT_PRICE,
    )
    save_barh_chart(
        charts["broker_eps"],
        "FY27 EPS framing across key brokers",
        "Wide range reflects disagreement on how fast AI revenue converts into earnings",
        [x[0] for x in BROKER_EPS_27],
        [x[1] for x in BROKER_EPS_27],
        [GOLD, NAVY, BLUE, TEAL, LIGHT],
    )
    return charts


def header_footer(canvas, doc) -> None:
    canvas.saveState()
    w, h = letter
    canvas.setStrokeColor(colors.HexColor(LIGHT))
    canvas.line(doc.leftMargin, h - 0.42 * inch, w - doc.rightMargin, h - 0.42 * inch)
    canvas.setFont("Helvetica-Bold", 8.5)
    canvas.setFillColor(colors.HexColor(NAVY))
    canvas.drawString(doc.leftMargin, h - 0.34 * inch, "Broadcom Inc. - Equity Research Update")
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor(GRAY))
    canvas.drawRightString(w - doc.rightMargin, h - 0.34 * inch, REPORT_DATE)
    canvas.line(doc.leftMargin, 0.44 * inch, w - doc.rightMargin, 0.44 * inch)
    canvas.drawString(doc.leftMargin, 0.30 * inch, "Prepared for private-banker use from the provided report pack and prior extracted company data.")
    canvas.drawRightString(w - doc.rightMargin, 0.30 * inch, f"Page {canvas.getPageNumber()}")
    canvas.restoreState()


def make_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="Body",
            parent=styles["BodyText"],
            fontName="Times-Roman",
            fontSize=8.1,
            leading=9.4,
            textColor=colors.HexColor(DARK),
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Tiny",
            parent=styles["BodyText"],
            fontName="Times-Roman",
            fontSize=7.2,
            leading=8.2,
            textColor=colors.HexColor(DARK),
            spaceAfter=3,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ERBullet",
            parent=styles["BodyText"],
            fontName="Times-Roman",
            fontSize=8.0,
            leading=9.2,
            leftIndent=12,
            firstLineIndent=-8,
            textColor=colors.HexColor(DARK),
            spaceAfter=3,
        )
    )
    styles.add(
        ParagraphStyle(
            name="TitleLarge",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=19,
            leading=21,
            textColor=colors.HexColor(NAVY),
            alignment=TA_LEFT,
            spaceAfter=2,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Subtitle",
            parent=styles["Heading2"],
            fontName="Helvetica",
            fontSize=10.2,
            leading=12,
            textColor=colors.HexColor(GRAY),
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Section",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13.2,
            leading=14.4,
            textColor=colors.HexColor(NAVY),
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CenterNote",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=7.0,
            leading=8.0,
            textColor=colors.HexColor(GRAY),
            alignment=TA_CENTER,
            spaceAfter=2,
        )
    )
    return styles


def info_table(rows: list[list[str]], col_widths: list[float], highlight_col: int | None = None) -> Table:
    table = Table(rows, colWidths=col_widths, hAlign="LEFT")
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(NAVY)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 7.9),
        ("TOPPADDING", (0, 0), (-1, 0), 5),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor(LIGHTER)]),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 7.7),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#C7D4DE")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 1), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 3),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]
    if highlight_col is not None:
        style.extend(
            [
                ("BACKGROUND", (highlight_col, 1), (highlight_col, -1), colors.HexColor(LIGHT)),
                ("FONTNAME", (highlight_col, 1), (highlight_col, -1), "Helvetica-Bold"),
            ]
        )
    table.setStyle(TableStyle(style))
    return table


def image_flow(path: Path, width: float, height: float, caption: str | None = None, styles=None):
    img = RLImage(str(path), width=width, height=height)
    if caption:
        return [img, Paragraph(caption, styles["CenterNote"])]
    return [img]


def side_by_side(left_flowables: list, right_flowables: list, widths: tuple[float, float] = (3.45 * inch, 3.45 * inch)) -> Table:
    tbl = Table([[left_flowables, right_flowables]], colWidths=list(widths), hAlign="LEFT")
    tbl.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return tbl


def make_pdf(charts: dict[str, Path]) -> None:
    styles = make_styles()
    doc = SimpleDocTemplate(
        str(PDF_PATH),
        pagesize=letter,
        leftMargin=0.48 * inch,
        rightMargin=0.48 * inch,
        topMargin=0.62 * inch,
        bottomMargin=0.58 * inch,
    )
    story = []

    def add_title(title: str, subtitle: str) -> None:
        story.append(Paragraph(title, styles["TitleLarge"]))
        story.append(Paragraph(subtitle, styles["Subtitle"]))

    add_title(TITLE, f"{SUBTITLE} | Rating: Outperform | Target Price: ${TARGET_PRICE:.0f} | Price as of {PRICE_DATE}: ${CURRENT_PRICE:.2f}")
    rating_table = info_table(
        [
            ["Rating box", "Value"],
            ["Recommendation", "Outperform"],
            ["Current price", f"${CURRENT_PRICE:.2f}"],
            ["Target price", f"${TARGET_PRICE:.0f}"],
            ["Implied upside", f"{UPSIDE:.1%}"],
            ["Market cap", f"${MARKET_CAP_B:,.0f}bn"],
            ["Enterprise value", f"${ENTERPRISE_VALUE_B:,.0f}bn"],
            ["Quarterly dividend", f"${DIVIDEND_Q:.2f}"],
        ],
        [1.6 * inch, 1.45 * inch],
        highlight_col=1,
    )
    company_snapshot = [
        Paragraph("<b>What Broadcom is:</b> Broadcom is a global semiconductor and infrastructure software company. In plain English, it sells the chips and networking gear that move data inside AI clusters, plus mission-critical enterprise software that generates steady cash flow.", styles["Body"]),
        Paragraph("<b>Why the stock matters now:</b> The latest quarterly results pushed Broadcom deeper into the core of the AI investment theme. Management and most brokers now believe the company has line of sight to more than $100bn of AI revenue in FY27, while cash generation remains strong enough to fund buybacks, dividends and debt reduction.", styles["Body"]),
        Paragraph("<b>Who this note is for:</b> This version is written for a private banker who needs to explain the company quickly to clients: what Broadcom does, what changed in the latest quarter, what the upside case is, what could go wrong, and where valuation sits today.", styles["Body"]),
    ]
    story.append(side_by_side([rating_table], company_snapshot))
    story.append(Spacer(1, 0.06 * inch))
    summary_table = info_table(
        [
            ["Q1 FY26 summary", "Actual", "Street", "Variance"],
            ["Revenue", "$19.3bn", "$19.2bn", "+0.5%"],
            ["AI revenue", "$8.4bn", "$8.2bn", "+2.4%"],
            ["Gross margin", "77.0%", "76.8%", "+20bps"],
            ["Adj. EPS", "$2.05", "$2.03", "+1.0%"],
            ["Q2 revenue guide", "$22.0bn", "$20.5bn", "+7.3%"],
            ["Q2 AI guide", "$10.7bn", "$9.3bn", "+15.1%"],
        ],
        [1.8 * inch, 1.05 * inch, 1.05 * inch, 1.1 * inch],
        highlight_col=1,
    )
    summary_bullets = [
        Paragraph("1. <b>Latest earnings update:</b> Broadcom delivered a clean beat in Q1 FY26 and, more importantly, guided Q2 well above consensus. AI revenue rose to $8.4bn in Q1 and management pointed to $10.7bn in Q2, with networking already one-third of AI sales and heading toward 40%.", styles["ERBullet"]),
        Paragraph("2. <b>Investment thesis:</b> Broadcom is becoming the scaled alternative to merchant GPU economics. Hyperscalers increasingly want custom accelerators and high-performance networking to lower cost per inference, and Broadcom is one of the few suppliers with both capabilities.", styles["ERBullet"]),
        Paragraph("3. <b>What clients should watch:</b> The next leg of the stock depends on whether AI revenue can progress from a FY26 run-rate story into visible FY27 customer deployments without gross-margin damage. That is why customer breadth, networking mix and capital-return discipline matter more than a single quarterly beat.", styles["ERBullet"]),
    ]
    story.append(side_by_side([summary_table], image_flow(charts["targets"], 3.35 * inch, 2.4 * inch, "Figure 1. Price targets sampled from the provided broker pack.", styles)))
    story.append(Spacer(1, 0.04 * inch))
    story.extend(summary_bullets)
    story.append(PageBreak())

    add_title("Latest Earnings Update", "Q1 FY26 delivered the combination investors wanted: better numbers, better guide, and a cleaner margin message")
    story.append(
        Paragraph(
            "Q1 FY26 revenue of $19.3bn beat consensus modestly, but the quality of the beat was stronger than the headline. Semiconductor solutions rose to $12.5bn, infrastructure software held at $6.8bn, and AI revenue reached $8.4bn. Q2 guidance is what changed the narrative: Broadcom guided total revenue to $22.0bn and AI revenue to $10.7bn, well above the street figures carried into the print.",
            styles["Body"],
        )
    )
    story.append(Paragraph("The most important analytical point is that Broadcom did not simply beat by a narrow amount; it changed the shape of forward expectations. The combination of stronger AI revenue, a materially better Q2 guide, and steady margin guidance tells investors that the company is scaling into demand rather than chasing it.", styles["Body"]))
    beat_table = info_table(
        [
            ["Beat / miss dashboard", "Actual", "Street", "Comment"],
            ["Total revenue", "$19.3bn", "$19.2bn", "Beat driven by semiconductor solutions"],
            ["AI revenue", "$8.4bn", "$8.2bn", "Custom ASIC plus networking upside"],
            ["Semi solutions", "$12.5bn", "$12.3bn", "AI more than offset soft legacy markets"],
            ["Infrastructure software", "$6.8bn", "$6.9bn", "Stable, slightly light"],
            ["Gross margin", "77.0%", "76.8%", "In line to slightly better"],
            ["Operating margin", "66.4%", "65.5%", "Meaningfully better cost flow-through"],
            ["Adjusted EPS", "$2.05", "$2.03", "Small EPS beat, better quality than size"],
        ],
        [1.55 * inch, 1.0 * inch, 1.0 * inch, 3.35 * inch],
    )
    story.append(beat_table)
    story.append(Spacer(1, 0.05 * inch))
    story.append(
        side_by_side(
            image_flow(charts["rev_ai"], 3.35 * inch, 2.35 * inch, "Figure 2. Revenue and AI revenue progression.", styles),
            image_flow(charts["q1_mix"], 3.35 * inch, 2.35 * inch, "Figure 3. Q1 revenue mix shows AI is already central.", styles),
        )
    )
    story.append(
        Paragraph(
            "For a banker explaining the quarter to a client, the simplest takeaway is this: Broadcom is no longer merely an AI beneficiary; it is already operating at AI scale. AI revenue was 43% of total company revenue in the quarter, while non-AI semiconductors were roughly flat. That means the stock's next moves will be driven primarily by whether AI demand keeps compounding and whether those revenues remain high-quality.",
            styles["Body"],
        )
    )
    story.append(Paragraph("That matters for estimates because a company can miss or beat by a few hundred million dollars for short-term reasons, but it rarely raises the credibility of an entire revenue framework unless customers are ordering with conviction. In this case, the attached broker notes broadly converge on the idea that Broadcom's visibility improved, not just the reported quarter.", styles["Body"]))
    story.append(PageBreak())

    add_title("AI Engine And Customer Roadmap", "The market is paying for AI, but the source pack suggests the revenue runway may still be underappreciated")
    story.append(
        Paragraph(
            "The AI debate has shifted from quarterly surprise to duration. Management indicated line of sight to more than $100bn of FY27 AI revenue on close to 10GW of deployed compute across six custom-silicon customers. J.P. Morgan pushed that framework to $120bn+, UBS to above $130bn, and Jefferies argued that the upper bound could be much higher if revenue per gigawatt and networking content continue to expand.",
            styles["Body"],
        )
    )
    story.append(Paragraph("For client conversations, the right framing is that Broadcom is becoming less of a one-quarter AI trade and more of a multi-customer infrastructure platform story. The market now has to judge durability, customer breadth and monetization per deployment, which is a much stronger place for the investment case to sit.", styles["Body"]))
    story.append(
        side_by_side(
            image_flow(charts["ai_mix"], 3.35 * inch, 2.35 * inch, "Figure 4. AI networking is becoming a larger part of the mix.", styles),
            image_flow(charts["ai_frames"], 3.35 * inch, 2.35 * inch, "Figure 5. FY27 AI revenue frameworks vary widely.", styles),
        )
    )
    for line in [
        "1. <b>Google remains foundational.</b> The source pack repeatedly ties current strength to Broadcom's TPU programs, including Ironwood and the next TPU generation. Google remains the anchor customer that proves Broadcom can execute at volume.",
        "2. <b>Anthropic and OpenAI expand the customer set.</b> J.P. Morgan and Goldman describe Anthropic ramping toward roughly 3GW in FY27, while OpenAI is discussed as a newly qualified customer with 1GW-plus potential. That matters because the bear case on Broadcom has always been customer concentration.",
        "3. <b>Meta and other customers keep the story from being single-threaded.</b> Multiple brokers pushed back on fears that Meta's ASIC roadmap had stalled. Notes also point to additional customers, often identified as Bytedance and SoftBank/Arm, which broadens the demand base into FY27.",
        "4. <b>Networking may be the surprise.</b> UBS, Goldman, Jefferies and HSBC all emphasize that Broadcom is not just shipping compute die. Tomahawk, merchant switching, optical interconnect and copper-based scale-up networking are lifting revenue quality and helping the margin conversation.",
    ]:
        story.append(Paragraph(line, styles["ERBullet"]))
    story.append(info_table(ROBOTICS_LINK, [1.35 * inch, 3.45 * inch, 2.1 * inch]))
    story.append(
        Paragraph(
            "This robotics angle strengthens the networking argument. Training world models, multimodal perception stacks and reinforcement-learning systems in simulation requires the same kind of dense accelerator clusters used for advanced AI training, but often with even heavier video and sensor data movement. In that setup, the chip and networking bottlenecks capture value earlier than software layers that are still private or harder to monetize directly in public markets.",
            styles["Body"],
        )
    )
    story.append(
        Paragraph(
            "This is the main reason our price target remains constructive. When investors think only about custom ASICs, Broadcom can look cyclical and customer-dependent. When they include the networking attach opportunity, the company looks more like a system-level AI infrastructure supplier with multiple ways to win on every large cluster build.",
            styles["Body"],
        )
    )
    story.append(Paragraph("The robotics angle reinforces that conclusion. When investors think about robotics only at the application-software level, they miss where value tends to accrue in the early buildout phase. Training world models and large multimodal systems forces spending into accelerators, networking and memory long before end-market software economics are visible. Broadcom therefore sits closer to the near-term monetization layer than many more conceptually exciting robotics names.", styles["Body"]))
    story.append(PageBreak())

    add_title("Guidance, Margins, And Capital Returns", "The quarter eased the two biggest practical concerns: margin dilution and whether cash returns could continue")
    guide_table = info_table(
        [
            ["Q2 FY26 guide", "Management", "Street", "Read-through"],
            ["Revenue", "$22.0bn", "$20.5bn", "A meaningfully stronger top-line guide"],
            ["AI revenue", "$10.7bn", "$9.3bn", "Networking and XPU upside"],
            ["Non-AI semi revenue", "$4.1bn", "n.a.", "Roughly stable, no further deterioration"],
            ["Software revenue", "$7.2bn", "n.a.", "Steady cash engine"],
            ["Adj. EBITDA margin", "68.0%", "67.1%", "Margin pressure lower than feared"],
        ],
        [1.6 * inch, 1.15 * inch, 1.15 * inch, 3.2 * inch],
    )
    margin_commentary = [
        Paragraph("Broadcom did not merely guide revenue higher; it showed that the AI ramp can remain financially attractive as it scales. That distinction is central because investors were increasingly worried that additional AI business would carry lower incremental profitability.", styles["Body"]),
        Paragraph("<b>Why margins matter:</b> A recurring investor concern was that Broadcom's Anthropic and rack-related business would dilute margins because of pass-through content. UBS and Morgan Stanley both argue that this fear eased after management indicated a better mix of higher-margin networking and possible use of ODM partners.", styles["Body"]),
        Paragraph("<b>Cash flow remains a backstop:</b> J.P. Morgan noted $8.3bn of operating cash flow in Q1 FY26 with capex of only $250m. Broadcom spent $7.9bn on buybacks and $3.0bn on dividends in the same quarter, then approved a fresh $10bn repurchase authorization. That matters for private clients because the stock is not a pure concept trade; it throws off real cash.", styles["Body"]),
        Paragraph("<b>Software continues to do its job:</b> The software segment was only a touch light in Q1, but it remained stable and profitable. For a client portfolio, that stability lowers the probability that all of Broadcom's value has to come from one AI revenue path.", styles["Body"]),
    ]
    story.append(side_by_side([guide_table], image_flow(charts["cash"], 3.35 * inch, 2.35 * inch, "Figure 6. Capital return stayed aggressive in Q1 FY26.", styles)))
    story.append(Spacer(1, 0.03 * inch))
    for block in margin_commentary:
        story.append(block)
    story.append(Paragraph("From a portfolio perspective, this page matters because it explains why Broadcom can still be owned by clients who value cash discipline. The company is not asking investors to suspend disbelief on free cash flow while waiting for a distant payoff; it is already converting earnings into capital returns.", styles["Body"]))
    story.append(PageBreak())

    add_title("Core Investment Thesis", "Three reasons Broadcom still works for long-term client portfolios despite a big run in AI enthusiasm")
    thesis_blocks = [
        "<b>Thesis pillar 1 - Broadcom is moving from component supplier to AI platform enabler.</b> Broadcom combines custom accelerator design, advanced packaging, switch silicon, interconnect, and supporting infrastructure in a way few large-cap peers can match. That positioning gives it multiple revenue streams per customer deployment and makes the business less dependent on any one chip generation. For a banker, the client message is simple: Broadcom is not betting on a single product, but on the architecture of AI data centers.",
        "<b>Thesis pillar 2 - The earnings power is still rising faster than the stock narrative implies.</b> The broker pack spans a wide range of FY27 EPS views, but almost every note moved estimates up after the quarter. Our own base case uses FY27 adjusted EPS of $20.00, below the most bullish broker numbers but comfortably above the market's old framing. If Broadcom simply executes to the current AI framework while software stays stable, earnings compounding can support further upside without requiring a speculative multiple.",
        "<b>Thesis pillar 3 - Capital returns and software cash flows make the story more investable.</b> Many AI names ask investors to underwrite distant free cash flow. Broadcom is different. The software franchise, even if it grows only in the low-to-mid single digits, provides recurring cash while semiconductors drive upside. That allows Broadcom to support a dividend, buy back stock, and keep leverage under control while still funding growth.",
        "<b>Who should own it:</b> Broadcom fits best for clients who want AI exposure but prefer a company with mature cash generation and a more diversified earnings base than a single-product semiconductor story. It is less appropriate for clients who need immediate near-term certainty on AI spending trends, because the stock will remain sensitive to any wobble in hyperscaler capex expectations.",
    ]
    for block in thesis_blocks:
        story.append(Paragraph(block, styles["Body"]))
    story.append(Spacer(1, 0.05 * inch))
    story.append(info_table(THESIS_MATRIX, [1.45 * inch, 3.0 * inch, 2.45 * inch]))
    story.append(Paragraph("The coherence of the thesis matters as much as the individual data points. The reason Broadcom's story works is that the moving parts reinforce one another: customer breadth makes AI revenue more credible, networking mix supports margins, software stabilizes cash generation, and capital returns make it easier for clients to hold through volatility.", styles["Body"]))
    story.append(Paragraph("That is also why the note does not rest on a single heroic number. Even if Broadcom lands below the highest broker estimates for FY27 AI revenue, the stock can still work well if the company proves that deployments are broad, margins remain intact and software keeps functioning as a ballast.", styles["Body"]))
    story.append(PageBreak())

    add_title("Business Overview Beyond The AI Headline", "Private clients often know Broadcom as 'an AI stock'; they should know the full business as well")
    story.append(
        side_by_side(
            [
                Paragraph("<b>Semiconductors:</b> Broadcom's semiconductor business includes AI accelerators, networking silicon, broadband chips, wireless connectivity, storage and industrial infrastructure components. In the current cycle, AI and networking dominate the story, but the legacy portfolio still matters for diversification.", styles["Body"]),
                Paragraph("<b>Infrastructure software:</b> This segment includes VMware-related software assets and other enterprise infrastructure products. It is not the growth engine today, but it is still the cash engine that helps fund shareholder returns and smooth cyclicality.", styles["Body"]),
                Paragraph("<b>Why this matters for portfolio construction:</b> A client buying Broadcom is buying a company with one foot in structural AI growth and another in durable enterprise infrastructure. That mix is why many analysts still see Broadcom as investable even if the AI build-out becomes choppier.", styles["Body"]),
            ],
            image_flow(charts["annual_mix"], 3.35 * inch, 2.35 * inch, "Figure 7. Our annual mix view keeps software meaningful even as semis surge.", styles),
        )
    )
    story.append(
        side_by_side(
            image_flow(CROP_DIR / "jpm_crop_metrics.png", 3.35 * inch, 3.2 * inch, "Figure 8. Cropped JPMorgan chart / table view from the provided report pack.", styles),
            [
                Paragraph("<b>What the software risk really is:</b> The UBS software deep dive is helpful because it identifies where this backstop could weaken. The risks are VMware customer churn when three-year contracts renew, tougher comparisons after VCF upsell, and the possibility that AI coding tools speed cloud migration rather than on-prem modernization. We do not think those risks break the stock today, but they matter because they affect how much downside support software deserves in a drawdown.", styles["Body"]),
                Paragraph("<b>What the non-AI semiconductor risk really is:</b> Legacy businesses are stable rather than exciting. That is acceptable as long as they stop getting worse. A broad cyclical recovery in enterprise networking, storage or broadband would be upside, not something required to justify the stock.", styles["Body"]),
            ],
        )
    )
    story.append(PageBreak())

    add_title("Valuation And Price Target", "Our $500 target is still defendable even after the stronger quarter")
    valuation_table = info_table(
        [
            ["Valuation scenario", "EPS basis", "Multiple", "Value / share", "Interpretation"],
            ["Bear", "$15.00", "24x", "$360", "AI digestion, softer software renewals, multiple compresses"],
            ["Base", "$20.00", "25x", "$500", "Current AI ramp executes with manageable margin pressure"],
            ["Bull", "$23.00", "25x", "$575", "Networking attach and customer breadth exceed current expectations"],
        ],
        [1.1 * inch, 1.0 * inch, 0.9 * inch, 1.0 * inch, 3.0 * inch],
        highlight_col=3,
    )
    story.append(valuation_table)
    story.append(Spacer(1, 0.05 * inch))
    story.append(
        side_by_side(
            image_flow(charts["scenario"], 3.35 * inch, 2.35 * inch, "Figure 9. House valuation scenarios.", styles),
            image_flow(charts["broker_eps"], 3.35 * inch, 2.35 * inch, "Figure 10. FY27 EPS expectations across brokers.", styles),
        )
    )
    story.append(Paragraph("In practical terms, valuation now depends on which earnings stream investors choose to trust. The attached broker pack shows a wide FY27 EPS range, but even the more conservative views still support a healthy premium to the current share price if Broadcom executes. The more bullish views suggest that current valuation still discounts a meaningful portion of the AI upside.", styles["Body"]))
    for block in [
        "Our base case target price of $500 is built from 25x FY27 adjusted EPS of $20.00. That framework lands in the middle of the provided broker range and below the most optimistic AI cases. It is intentionally not heroic.",
        "For private clients, the key point is that Broadcom does not need a speculative software-style multiple to work. If the company can deliver something close to current FY27 earnings potential, today's share price still leaves room for attractive upside.",
        "Why not use a higher target? Because the stock is already carrying AI expectations and because the software segment should probably receive a more sober multiple than it did during peak VMware enthusiasm. We would rather preserve credibility and let execution create the rerating.",
    ]:
        story.append(Paragraph(block, styles["Body"]))
    story.append(RLImage(str(CROP_DIR / "jeff_crop_charts.png"), width=6.8 * inch, height=2.15 * inch))
    story.append(Paragraph("Figure 11. Jefferies chart page from the attached report pack, showing historical surprise, forward P/E, margins and short interest (4 Mar 2026).", styles["CenterNote"]))
    story.append(PageBreak())

    add_title("Key Risks And Near-Term Catalysts", "The stock can still work well, but the debate is now more about durability than discovery")
    risks_table = info_table(
        [
            ["Risk", "Why it matters", "What to monitor"],
            ["Hyperscaler capex normalization", "Broadcom is now judged on multi-year AI deployment rather than a single quarterly beat.", "Cloud capex budgets, AI cluster build timing, customer commentary."],
            ["Customer insourcing / COT", "If customers internalize more design value, Broadcom's content pool may narrow over time.", "Management commentary on in-house silicon, design-win cadence."],
            ["Gross-margin dilution", "Racks or pass-through content could lower earnings conversion if mix changes unfavorably.", "Networking share of AI revenue, incremental gross margin, Anthropic mix."],
            ["Software renewal churn", "A weaker software franchise reduces valuation support in tougher markets.", "VMware renewal rates, VCF growth, enterprise spending trends."],
            ["Supply chain constraints", "HBM, packaging and substrate availability can cap upside or shift timing.", "Supplier commentary, lead times, booking patterns."],
        ],
        [1.45 * inch, 3.35 * inch, 2.05 * inch],
    )
    catalyst_table = info_table(
        [
            ["Catalyst", "Why clients should care"],
            ["Next quarterly earnings", "Confirms whether AI revenue can move from $8.4bn to $10.7bn and sustain the trajectory."],
            ["Customer deployment disclosures", "Evidence that OpenAI, Meta and Anthropic are ramping reduces concentration concerns."],
            ["Networking mix updates", "A larger networking contribution supports both revenue quality and margins."],
            ["Buyback execution", "Aggressive repurchases can soften drawdowns and improve per-share earnings power."],
        ],
        [2.15 * inch, 4.75 * inch],
    )
    story.append(risks_table)
    story.append(Spacer(1, 0.05 * inch))
    story.append(side_by_side([catalyst_table], image_flow(CROP_DIR / "ms_crop_risk_reward.png", 3.35 * inch, 3.0 * inch, "Figure 11. Cropped Morgan Stanley risk / reward exhibit from the source pack.", styles)))
    story.append(
        Paragraph(
            "If there is one message to leave with clients, it is this: Broadcom remains attractive, but the stock is no longer driven mainly by surprise. It is driven by whether management can keep proving that AI demand is broad, margins are durable, and cash returns remain abundant. Those are the three signals to monitor most closely over the next twelve months.",
            styles["Body"],
        )
    )
    story.append(PageBreak())

    add_title("Street Read-Through", "The broker pack is constructive, but it also shows where the real debate sits")
    story.append(info_table(BROKER_GRID, [1.35 * inch, 0.8 * inch, 4.85 * inch]))
    story.append(
        Paragraph(
            "The broad message across the pack is bullish, but not identical. J.P. Morgan centers on line of sight to more than $100bn of FY27 AI sales and a move to $500. UBS is more impressed by margin resilience than by the headline AI number itself, arguing management's >$100bn floor still looks conservative. Morgan Stanley leans on risk / reward and uses a lower multiple than in the past, yet still sees attractive upside. HSBC remains the most aggressive on upside from ASIC plus networking. That spread is useful: it tells us the real debate is no longer whether Broadcom is winning, but how far that win can extend into FY27 and FY28.",
            styles["Body"],
        )
    )
    story.append(info_table(DEBATE_MATRIX, [1.75 * inch, 2.55 * inch, 2.7 * inch]))
    story.append(
        side_by_side(
            image_flow(CROP_DIR / "ubs_crop_tpu.png", 3.35 * inch, 2.05 * inch, "Figure 12. UBS TPU unit estimates table (5 Mar 2026).", styles),
            image_flow(CROP_DIR / "hsbc_crop_revisions.png", 3.35 * inch, 2.05 * inch, "Figure 13. HSBC consensus revision exhibits (24 Nov 2025 note).", styles),
        )
    )
    story.append(
        Paragraph(
            "That also means clients should not overreact to a single number like quarterly gross margin or one customer's spending cadence. The more durable signals are customer breadth, revenue per deployed GW, networking attach, and whether software keeps providing downside support. In other words, this has become a duration story.",
            styles["Body"],
        )
    )
    story.append(Paragraph("The disagreement across brokers is useful rather than problematic. It shows where the real questions still are: not whether Broadcom has AI exposure, but whether the upper end of AI revenue, networking monetization and software resilience should command a higher multiple than the market currently grants. That is a more sophisticated and ultimately more constructive debate than arguing over whether the quarter was simply 'good' or 'bad.'", styles["Body"]))
    story.append(PageBreak())

    add_title("Detailed Estimates And Portfolio Framing", "Appendix tables for bankers who want the numbers and the practical client framing behind the recommendation")
    story.append(info_table(ESTIMATE_MATRIX, [2.0 * inch, 1.25 * inch, 1.25 * inch, 1.25 * inch], highlight_col=2))
    story.append(Spacer(1, 0.06 * inch))
    story.append(
        Paragraph(
            "House view summary: Broadcom remains one of the best large-cap ways to express AI infrastructure demand without giving up balance-sheet strength and cash flow visibility. We rate the shares Outperform with a $500 target price. The stock is appropriate for growth-oriented clients who can tolerate periodic AI-capex-driven volatility and who want AI exposure backed by real free cash flow.",
            styles["Body"],
        )
    )
    story.append(info_table(CLIENT_FIT, [1.8 * inch, 5.2 * inch]))
    story.append(info_table(MONITORING_FRAME, [1.55 * inch, 3.1 * inch, 2.35 * inch]))
    story.append(
        Paragraph(
            "If this report is being used in a client conversation, the cleanest summary is that Broadcom offers a combination many AI beneficiaries do not: it participates in a very large infrastructure buildout, it monetizes both compute and networking bottlenecks, and it still generates the kind of cash flow that makes the stock investable for mainstream portfolios rather than only for high-conviction thematic accounts.",
            styles["Body"],
        )
    )

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)


def shade_cell(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def set_cell_text(cell, text: str, bold: bool = False) -> None:
    cell.text = ""
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = p.add_run(text)
    run.bold = bold
    run.font.name = "Times New Roman"
    run.font.size = Pt(8.5)


def add_docx_table(document: Document, rows: list[list[str]], widths: list[float]) -> None:
    table = document.add_table(rows=len(rows), cols=len(rows[0]))
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.style = "Table Grid"
    for i, width in enumerate(widths):
        for cell in table.columns[i].cells:
            cell.width = Inches(width)
    for r, row in enumerate(rows):
        for c, value in enumerate(row):
            set_cell_text(table.cell(r, c), value, bold=(r == 0))
            if r == 0:
                shade_cell(table.cell(r, c), "10324A")
        if r == 0:
            for cell in table.rows[r].cells:
                for run in cell.paragraphs[0].runs:
                    run.font.color.theme_color = None
    document.add_paragraph()


def set_page(section) -> None:
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(0.55)
    section.bottom_margin = Inches(0.5)
    section.left_margin = Inches(0.55)
    section.right_margin = Inches(0.55)


def add_header(section, title: str) -> None:
    header = section.header
    p = header.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = p.add_run(f"Broadcom Inc. - Equity Research Update | {title}")
    run.bold = True
    run.font.name = "Times New Roman"
    run.font.size = Pt(8)


def add_docx_page(document: Document, header_title: str) -> None:
    section = document.add_section(WD_SECTION.NEW_PAGE)
    set_page(section)
    add_header(section, header_title)


def make_docx(charts: dict[str, Path]) -> None:
    document = Document()
    set_page(document.sections[0])
    add_header(document.sections[0], "Summary")
    normal = document.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.font.size = Pt(8.7)

    def title(text: str, subtitle: str) -> None:
        p = document.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        r = p.add_run(text)
        r.bold = True
        r.font.name = "Times New Roman"
        r.font.size = Pt(19)
        p2 = document.add_paragraph()
        r2 = p2.add_run(subtitle)
        r2.font.name = "Times New Roman"
        r2.font.size = Pt(10)

    title(TITLE, f"{SUBTITLE} | {REPORT_DATE}")
    document.add_paragraph("Broadcom is a semiconductor and infrastructure software platform whose latest quarterly results pushed the stock further into the center of the AI infrastructure trade. This report is written for a private banker who needs the company explained clearly before discussing valuation, catalysts and risks.")
    add_docx_table(
        document,
        [
            ["Key metric", "Value", "Commentary"],
            ["Recommendation", "Outperform", "AI custom silicon plus networking remain under-modeled"],
            ["Current price", f"${CURRENT_PRICE:.2f}", f"As of {PRICE_DATE}"],
            ["Target price", f"${TARGET_PRICE:.0f}", f"{UPSIDE:.1%} upside"],
            ["Market cap", f"${MARKET_CAP_B:,.0f}bn", "Mega-cap infrastructure platform"],
            ["Enterprise value", f"${ENTERPRISE_VALUE_B:,.0f}bn", "Still backed by heavy cash generation"],
        ],
        [1.7, 1.2, 4.2],
    )
    document.add_picture(str(charts["targets"]), width=Inches(6.9))
    document.add_paragraph("Key takeaways: the quarter beat modestly, the guide beat convincingly, AI revenue keeps accelerating, networking is becoming a larger mix, and buybacks plus software cash flow still anchor the story.")

    add_docx_page(document, "Latest earnings")
    document.add_heading("Latest Earnings Update", level=1)
    document.add_paragraph("Q1 FY26 revenue was $19.3bn, AI revenue was $8.4bn, and management guided Q2 revenue to $22.0bn with AI revenue at $10.7bn. For clients, the clean message is that Broadcom moved from being an AI optionality name to being an AI scale name.")
    add_docx_table(
        document,
        [
            ["Metric", "Actual", "Street", "Comment"],
            ["Revenue", "$19.3bn", "$19.2bn", "Modest beat"],
            ["AI revenue", "$8.4bn", "$8.2bn", "Better mix and stronger demand"],
            ["Gross margin", "77.0%", "76.8%", "Slightly better"],
            ["Adj. EPS", "$2.05", "$2.03", "Small EPS beat"],
            ["Q2 guide revenue", "$22.0bn", "$20.5bn", "Material beat"],
            ["Q2 AI guide", "$10.7bn", "$9.3bn", "Very strong beat"],
        ],
        [1.7, 1.1, 1.1, 3.1],
    )
    document.add_picture(str(charts["rev_ai"]), width=Inches(6.8))
    document.add_picture(str(charts["q1_mix"]), width=Inches(6.8))
    document.add_paragraph("The important point is that Broadcom improved the quality of forward expectations rather than simply printing a narrow beat. That is what makes the quarter useful for finance professionals thinking about position durability.")

    add_docx_page(document, "AI engine")
    document.add_heading("AI Engine And Customer Roadmap", level=1)
    for para in [
        "Management now frames FY27 AI revenue at more than $100bn on around 10GW of compute deployments across six customers. The source pack pushes that figure meaningfully higher in several cases.",
        "Google remains the anchor TPU customer, but the story is broadening to Anthropic, OpenAI, Meta and other large programs. That shift matters because it lowers concentration risk.",
        "Networking is becoming more important. Several brokers expect it to rise from one-third of AI revenue in Q1 to 40% in Q2 and remain elevated through FY27, which is helpful for both growth and margins.",
    ]:
        document.add_paragraph(para)
    document.add_picture(str(charts["ai_mix"]), width=Inches(6.8))
    document.add_picture(str(charts["ai_frames"]), width=Inches(6.8))
    add_docx_table(document, ROBOTICS_LINK, [1.5, 3.2, 1.8])
    document.add_paragraph("Robotics is relevant because world models, sensor fusion and simulation-heavy training create exactly the kind of networking-intensive compute load that Broadcom monetizes. Data itself is a moat, but the easier public-market bottleneck to own is still the infrastructure layer.")
    document.add_paragraph("This is one reason the Broadcom story is broader than a single-quarter chip narrative. It sits close to the near-term bottlenecks of AI and robotics infrastructure, where spending tends to occur before application-layer economics are fully visible.")

    add_docx_page(document, "Margins and cash")
    document.add_heading("Guidance, Margins, And Capital Returns", level=1)
    add_docx_table(
        document,
        [
            ["Q2 guide", "Management", "Street", "Implication"],
            ["Revenue", "$22.0bn", "$20.5bn", "Demand is accelerating"],
            ["AI revenue", "$10.7bn", "$9.3bn", "AI guide is the real surprise"],
            ["Adj. EBITDA margin", "68.0%", "67.1%", "Margin fears easing"],
            ["Software revenue", "$7.2bn", "n.a.", "Cash engine remains stable"],
        ],
        [1.8, 1.1, 1.1, 2.8],
    )
    document.add_picture(str(charts["cash"]), width=Inches(6.8))
    document.add_paragraph("Broadcom generated $8.3bn of operating cash flow in Q1 FY26, spent $7.9bn on buybacks, $3.0bn on dividends, and approved a new $10bn repurchase authorization. This is not a concept stock without cash support.")
    document.add_paragraph("For bankers, this is one of the features that makes Broadcom easier to recommend than more speculative AI names. The company is already converting strength into capital returns.")

    add_docx_page(document, "Investment thesis")
    document.add_heading("Core Investment Thesis", level=1)
    for para in [
        "Pillar 1: Broadcom is becoming a system-level AI infrastructure winner, not just a chip vendor.",
        "Pillar 2: Street earnings estimates are rising, but they still may not fully capture the duration of the FY27 AI build-out.",
        "Pillar 3: Software cash flows and capital returns make the stock easier to hold through AI-driven volatility.",
        "This profile suits clients who want serious AI exposure without giving up mature free cash flow and shareholder returns.",
    ]:
        document.add_paragraph(para)
    add_docx_table(document, THESIS_MATRIX, [1.6, 2.8, 2.3])
    document.add_paragraph("The coherence of the thesis matters more than any individual estimate. Customer breadth, networking mix, software resilience and capital return discipline all reinforce one another rather than pulling the story in different directions.")

    add_docx_page(document, "Business overview")
    document.add_heading("Business Overview Beyond The AI Headline", level=1)
    document.add_paragraph("Broadcom's semiconductor business drives upside, while infrastructure software still provides resilience. That combination matters for portfolio construction because it lowers the risk that the entire equity case rests on one AI demand curve.")
    document.add_picture(str(charts["annual_mix"]), width=Inches(6.8))
    document.add_picture(str(CROP_DIR / "jpm_crop_metrics.png"), width=Inches(6.8))
    document.add_paragraph("Software is not the headline growth engine, but it remains a meaningful valuation backstop. The main risk is whether VMware renewals and VCF upsell stay healthy enough to preserve that role.")

    add_docx_page(document, "Valuation")
    document.add_heading("Valuation And Price Target", level=1)
    add_docx_table(document, [["Scenario", "EPS", "Multiple", "Value"], ["Bear", "$15.00", "24x", "$360"], ["Base", "$20.00", "25x", "$500"], ["Bull", "$23.00", "25x", "$575"]], [1.4, 1.2, 1.0, 1.2])
    document.add_picture(str(charts["scenario"]), width=Inches(6.8))
    document.add_picture(str(charts["broker_eps"]), width=Inches(6.8))
    document.add_picture(str(CROP_DIR / "jeff_crop_charts.png"), width=Inches(6.8))
    document.add_paragraph("Our $500 target sits within the broker range and does not require a speculative multiple. The stock can still work if management simply executes on the current AI and cash-return framework.")
    document.add_paragraph("The key valuation judgment is not whether Broadcom deserves a heroic multiple. It is whether the market is still underestimating how much AI and networking earnings power can be realized over the next several quarters.")

    add_docx_page(document, "Risks and catalysts")
    document.add_heading("Key Risks And Catalysts", level=1)
    add_docx_table(
        document,
        [
            ["Risk", "Why it matters"],
            ["Hyperscaler capex normalization", "The stock is pricing duration of AI build-outs."],
            ["Customer insourcing", "Could reduce Broadcom's content over time."],
            ["Gross-margin dilution", "Rack mix or pass-through content could weaken EPS conversion."],
            ["Software churn", "Would reduce downside support from the enterprise franchise."],
            ["Supply chain", "HBM and packaging still matter for timing and scale."],
        ],
        [2.2, 4.6],
    )
    document.add_picture(str(CROP_DIR / "ms_crop_risk_reward.png"), width=Inches(6.8))
    document.add_paragraph("Catalysts to watch are the next earnings print, customer deployment disclosures, networking mix, and continued buyback execution.")

    add_docx_page(document, "Street read-through")
    document.add_heading("Street Read-Through", level=1)
    add_docx_table(document, BROKER_GRID, [1.4, 0.8, 4.6])
    add_docx_table(document, DEBATE_MATRIX, [1.8, 2.4, 2.3])
    document.add_picture(str(CROP_DIR / "ubs_crop_tpu.png"), width=Inches(6.8))
    document.add_picture(str(CROP_DIR / "hsbc_crop_revisions.png"), width=Inches(6.8))
    document.add_paragraph("The debate in the broker pack is not whether Broadcom is winning; it is how far the current AI framework can stretch into FY27 and FY28 without damaging margins or overextending valuation.")
    document.add_paragraph("That is a healthier debate for a long position because it moves the conversation away from binary quarter-to-quarter surprise and toward more durable drivers such as customer breadth, networking intensity and capital allocation.")

    add_docx_page(document, "Appendix")
    document.add_heading("Detailed Estimates And Portfolio Framing", level=1)
    add_docx_table(document, ESTIMATE_MATRIX, [2.2, 1.1, 1.1, 1.1])
    add_docx_table(document, CLIENT_FIT, [1.9, 4.5])
    add_docx_table(document, MONITORING_FRAME, [1.7, 3.0, 2.0])
    document.add_paragraph("Recommendation summary: Broadcom remains an attractive AI infrastructure holding for clients who want real earnings and free cash flow behind the theme. We keep an Outperform view with a $500 target price. The stock fits best where clients want meaningful AI exposure but still care about durability, cash conversion and portfolio usability.")

    document.save(str(DOCX_PATH))


def main() -> None:
    ensure_dirs()
    crop_source_charts()
    charts = generate_charts()
    make_pdf(charts)
    make_docx(charts)
    print(PDF_PATH)
    print(DOCX_PATH)


if __name__ == "__main__":
    main()
