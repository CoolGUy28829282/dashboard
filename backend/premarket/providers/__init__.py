"""Provider factories. Selection via PROVIDER_* env vars; every kind has a `mock`."""

from __future__ import annotations

from .. import config
from .base import CalendarProvider, LLMProvider, NewsProvider, PriceProvider, SeriesProvider


def prices() -> PriceProvider:
    kind = config.env("PROVIDER_PRICES", "yfinance")
    if kind == "mock":
        from .mock import MockPrices

        return MockPrices()
    if kind == "yfinance":
        from .yfinance_ import YFinancePrices

        return YFinancePrices()
    if kind in ("databento", "polygon", "broker"):
        from .stubs import StubPrices

        return StubPrices(kind)
    raise ValueError(f"unknown PROVIDER_PRICES={kind}")


def calendar() -> CalendarProvider:
    kind = config.env("PROVIDER_CALENDAR", "forexfactory")
    if kind == "mock":
        from .mock import MockCalendar

        return MockCalendar()
    from .forexfactory import ForexFactoryCalendar

    return ForexFactoryCalendar()


def news() -> NewsProvider:
    kind = config.env("PROVIDER_NEWS", "rss")
    if kind == "mock":
        from .mock import MockNews

        return MockNews()
    from .rss import RSSNews

    return RSSNews()


def series() -> SeriesProvider:
    kind = config.env("PROVIDER_SERIES", "fred")
    if kind == "mock":
        from .mock import MockSeries

        return MockSeries()
    from .fred import FredSeries

    return FredSeries()


def llm() -> LLMProvider:
    kind = config.env("PROVIDER_LLM", "rules")
    if kind == "mock":
        from .mock import MockLLM

        return MockLLM()
    if kind == "anthropic":
        from .llms import AnthropicLLM

        return AnthropicLLM()
    if kind == "openai":
        from .llms import OpenAICompatibleLLM

        return OpenAICompatibleLLM()
    from .llms import RulesLLM

    return RulesLLM()
