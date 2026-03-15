"""Finance data provider abstraction.

Supports multiple swappable providers. Each provider normalizes output
into a standard dict format so Claude prompts stay provider-agnostic.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any


class ProviderResult:
    """Standardized output from any provider query."""

    def __init__(self, provider: str, query: str, data: dict[str, Any], timestamp: str | None = None):
        self.provider = provider
        self.query = query
        self.data = data
        self.timestamp = timestamp or datetime.now().isoformat(timespec="seconds")

    def to_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "query": self.query,
            "timestamp": self.timestamp,
            "data": self.data,
        }

    def to_markdown(self) -> str:
        lines = [f"## Provider: {self.provider}", f"Query: {self.query}", f"Timestamp: {self.timestamp}", ""]
        for key, value in self.data.items():
            if isinstance(value, dict):
                lines.append(f"### {key}")
                for k2, v2 in value.items():
                    lines.append(f"- **{k2}**: {v2}")
            elif isinstance(value, list):
                lines.append(f"### {key}")
                for item in value:
                    lines.append(f"- {item}")
            else:
                lines.append(f"- **{key}**: {value}")
        return "\n".join(lines)


class BaseProvider:
    """Base class for finance data providers."""

    name: str = "base"
    requires_key: bool = True

    def __init__(self, config: dict[str, Any] | None = None):
        self.config = config or {}

    def is_configured(self) -> bool:
        if not self.requires_key:
            return True
        return bool(self.config.get("api_key"))

    def get_quote(self, ticker: str) -> ProviderResult:
        raise NotImplementedError

    def get_price_history(self, ticker: str, period: str = "1Y") -> ProviderResult:
        raise NotImplementedError

    def get_fundamentals(self, ticker: str) -> ProviderResult:
        raise NotImplementedError

    def get_estimates(self, ticker: str) -> ProviderResult:
        raise NotImplementedError

    def get_commodity_series(self, symbol: str, period: str = "1Y") -> ProviderResult:
        raise NotImplementedError

    def get_fx_rate(self, pair: str) -> ProviderResult:
        raise NotImplementedError


class StubProvider(BaseProvider):
    """Returns placeholder data for development and testing."""

    name = "stub"
    requires_key = False

    def get_quote(self, ticker: str) -> ProviderResult:
        return ProviderResult(self.name, f"quote:{ticker}", {
            "ticker": ticker,
            "price": 0.0,
            "change_pct": 0.0,
            "volume": 0,
            "note": "Stub data — connect a real provider in settings.",
        })

    def get_price_history(self, ticker: str, period: str = "1Y") -> ProviderResult:
        return ProviderResult(self.name, f"history:{ticker}:{period}", {
            "ticker": ticker,
            "period": period,
            "prices": [],
            "note": "Stub — no historical data available without a configured provider.",
        })

    def get_fundamentals(self, ticker: str) -> ProviderResult:
        return ProviderResult(self.name, f"fundamentals:{ticker}", {
            "ticker": ticker,
            "market_cap": None,
            "pe_ratio": None,
            "ev_ebitda": None,
            "revenue_ttm": None,
            "note": "Stub data — connect a real provider for fundamentals.",
        })

    def get_estimates(self, ticker: str) -> ProviderResult:
        return ProviderResult(self.name, f"estimates:{ticker}", {
            "ticker": ticker,
            "consensus_eps": None,
            "consensus_revenue": None,
            "note": "Stub data — connect a real provider for consensus estimates.",
        })

    def get_commodity_series(self, symbol: str, period: str = "1Y") -> ProviderResult:
        return ProviderResult(self.name, f"commodity:{symbol}:{period}", {
            "symbol": symbol,
            "period": period,
            "prices": [],
            "note": "Stub — no commodity data available without a configured provider.",
        })

    def get_fx_rate(self, pair: str) -> ProviderResult:
        return ProviderResult(self.name, f"fx:{pair}", {
            "pair": pair,
            "rate": None,
            "note": "Stub — no FX data available without a configured provider.",
        })


# --- Provider registry ---

PROVIDER_CLASSES: dict[str, type[BaseProvider]] = {
    "stub": StubProvider,
}

_settings_path: Path | None = None


def set_settings_path(path: Path) -> None:
    global _settings_path
    _settings_path = path


def load_provider_settings() -> dict[str, dict[str, Any]]:
    if _settings_path and _settings_path.exists():
        return json.loads(_settings_path.read_text(encoding="utf-8"))
    return {}


def get_provider(name: str) -> BaseProvider:
    settings = load_provider_settings()
    cls = PROVIDER_CLASSES.get(name, StubProvider)
    return cls(config=settings.get(name, {}))


def list_providers() -> list[dict[str, Any]]:
    settings = load_provider_settings()
    result = []
    for name, cls in PROVIDER_CLASSES.items():
        instance = cls(config=settings.get(name, {}))
        result.append({
            "name": name,
            "configured": instance.is_configured(),
            "requires_key": cls.requires_key,
        })
    return result


def fetch_provider_data(provider_names: list[str], instruments: list[str]) -> list[dict[str, Any]]:
    """Fetch data from multiple providers for multiple instruments.
    Returns a list of ProviderResult dicts ready for JSON serialization."""
    results = []
    for pname in provider_names:
        provider = get_provider(pname)
        for instrument in instruments:
            try:
                result = provider.get_quote(instrument)
                results.append(result.to_dict())
            except Exception:
                pass
    return results
