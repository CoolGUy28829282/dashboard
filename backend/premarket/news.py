"""Headlines: dedupe, tag by instrument keywords, lexicon sentiment, groups, per-feed health (spec 5.4)."""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any

from . import config, instruments
from .models import HeadlineOut, News
from .providers.base import Headline, NewsProvider
from .timeutil import iso


def _norm(t: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", t.lower()).strip()


def dedupe(items: list[Headline]) -> list[Headline]:
    seen: set[str] = set()
    out = []
    for h in sorted(items, key=lambda x: x.published or datetime.min.replace(tzinfo=None), reverse=True):  # noqa: DTZ901
        key = _norm(h.title)
        ukey = h.url.split("?")[0]
        if key in seen or ukey in seen:
            continue
        seen.add(key)
        seen.add(ukey)
        out.append(h)
    return out


def relevance(title: str, keywords: tuple[str, ...]) -> tuple[float, list[str]]:
    t = title.lower()
    hits = [k.strip() for k in keywords if k.lower() in t]
    return min(1.0, 0.25 * len(hits)), hits


def sentiment(title: str, instrument: str) -> tuple[str, float]:
    lex = config.load("feeds")["lexicon"]
    t = title.lower()
    if instrument == "GC":
        pos = sum(1 for w in lex["gold_bull"] if w in t)
        neg = sum(1 for w in lex["gold_bear"] if w in t)
    else:
        pos = sum(1 for w in lex["bullish_risk"] if w in t)
        neg = sum(1 for w in lex["bearish_risk"] if w in t)
    s = (pos - neg) / max(pos + neg, 1)
    return ("bullish" if s > 0 else "bearish" if s < 0 else "neutral"), float(s)


def groups_for(title: str, instrument: str) -> list[str]:
    g = config.load("feeds")["groups"]
    t = title.lower()
    keys = ["fed_rates", "geopolitics", "earnings"] + (["central_banks", "physical_demand", "etf_flows"] if instrument == "GC" else [])
    return [k for k in keys if any(w in t for w in g[k])]


def why_it_matters(h: HeadlineOut, instrument: str) -> str:
    tags = ", ".join(h.tags[:3]) if h.tags else "general market"
    tone = {"bullish": "supportive", "bearish": "a headwind", "neutral": "neutral"}[h.sentiment]
    return f"Mentions {tags}; reads {tone} for {instrument} on the lexicon."


def build(instrument: str, provider: NewsProvider, asof: datetime) -> tuple[News, float | None, int]:
    hours = int(config.load("feeds").get("lookback_hours", 18))
    ins = instruments.get(instrument)
    raw = provider.get_headlines(asof - timedelta(hours=hours))
    raw = [h for h in raw if h.published is None or h.published <= asof]
    items = dedupe(raw)
    outs: list[HeadlineOut] = []
    for h in items:
        rel, hits = relevance(h.title, ins.keywords)
        sent, _ = sentiment(h.title, instrument)
        outs.append(
            HeadlineOut(
                title=h.title,
                url=h.url,
                published=iso(h.published) if h.published else None,
                source=h.source,
                feed_id=h.feed_id,
                relevance=rel,
                tags=hits + groups_for(h.title, instrument),
                sentiment=sent,
            )
        )
    outs.sort(key=lambda x: (x.relevance, x.published or ""), reverse=True)
    for ho in outs[:5]:
        ho.pinned = True
        ho.why = why_it_matters(ho, instrument)
    relevant = [x for x in outs if x.relevance > 0]
    score = None
    if relevant:
        vals = [sentiment(h.title, instrument)[1] * (0.5 + h.relevance) for h in relevant]
        score = max(-1.0, min(1.0, sum(vals) / len(vals)))
    groups: dict[str, list[HeadlineOut]] = {}
    for ho in outs:
        for g in ho.tags:
            if g in ("fed_rates", "geopolitics", "earnings", "central_banks", "physical_demand", "etf_flows"):
                groups.setdefault(g, []).append(ho)
    feeds = provider.feed_health()
    news = News(
        summary="",
        summary_source="template",
        movers=[],
        movers_source="template",
        headlines=outs,
        groups=groups,
        feeds=feeds,
        sentiment_score=round(score, 3) if score is not None else None,
        as_of=iso(asof),
    )
    return news, score, len(relevant)


def template_summary(news: News, events_today: list[Any]) -> tuple[str, list[str]]:
    """Templated 'Overnight in 60 seconds' and 'What could move the window': lists, not prose pretending to analyse."""
    lines = []
    for h in [x for x in news.headlines if x.pinned][:5]:
        t = h.published[11:16] if h.published else "--:--"
        lines.append(f"{t} {h.title} ({h.source})")
    summary = "\n".join(lines) if lines else "No relevant headlines in the last 18 hours."
    movers = []
    for e in events_today:
        if e.impact in ("high", "medium") and e.time:
            movers.append(
                f"{e.time} {e.name} ({'red' if e.impact == 'high' else 'orange'} folder" + (f", consensus {e.consensus}" if e.consensus else "") + ")"
            )
    for h in [x for x in news.headlines if x.pinned and ("fed_rates" in x.tags or "earnings" in x.tags or "geopolitics" in x.tags)][:3]:
        movers.append(f"Headline: {h.title}")
    return summary, movers
