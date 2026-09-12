"""RSS news provider over config/feeds.yaml. Each feed cached separately with per-feed health."""

from __future__ import annotations

from datetime import datetime
from time import mktime

import feedparser
import httpx

from .. import config
from ..cache import fetch_json
from ..timeutil import UTC
from .base import Headline


class RSSNews:
    name = "rss"

    def __init__(self) -> None:
        self._health: list[dict] = []

    def _fetch(self, feed: dict) -> list[dict]:
        def fn() -> list[dict]:
            r = httpx.get(feed["url"], timeout=20, headers={"User-Agent": "premarket-dashboard/0.1"}, follow_redirects=True)
            r.raise_for_status()
            parsed = feedparser.parse(r.text)
            items = []
            for e in parsed.entries[:80]:
                ts = None
                for k in ("published_parsed", "updated_parsed"):
                    if getattr(e, k, None):
                        ts = datetime.fromtimestamp(mktime(getattr(e, k)), tz=UTC).isoformat()
                        break
                items.append({"title": e.get("title", ""), "url": e.get("link", ""), "published": ts, "summary": (e.get("summary", "") or "")[:400]})
            return items

        res = fetch_json(f"rss:{feed['id']}", fn, ttl_min=15)
        self._health.append({"id": feed["id"], "name": feed["name"], "ok": res.ok, "as_of": res.as_of, "count": len(res.value or []), "error": res.error})
        return res.value or []

    def get_headlines(self, since: datetime) -> list[Headline]:
        self._health = []
        out: list[Headline] = []
        for feed in config.load("feeds")["rss"]:
            for it in self._fetch(feed):
                pub = datetime.fromisoformat(it["published"]) if it.get("published") else None
                if pub and pub < since.astimezone(UTC):
                    continue
                out.append(Headline(it["title"], it["url"], pub, feed["name"], feed["id"], it.get("summary", "")))
        return out

    def feed_health(self) -> list[dict]:
        return self._health
