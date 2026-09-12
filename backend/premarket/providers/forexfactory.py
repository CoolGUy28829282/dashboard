"""Forex Factory weekly JSON calendar (free, rate-limited). Cached on disk, backs off on failure."""

from __future__ import annotations

from datetime import datetime, timedelta

import httpx

from ..cache import fetch_json
from ..timeutil import NY, UTC, to_ny
from .base import CalEvent, Health

URLS = {
    "this": "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
    "next": "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
    "last": "https://nfs.faireconomy.media/ff_calendar_lastweek.json",
}
IMPACT = {"High": "high", "Medium": "medium", "Low": "low", "Holiday": "holiday"}


class ForexFactoryCalendar:
    name = "forexfactory"

    def __init__(self) -> None:
        self._ok = True
        self._as_of: str | None = None
        self._err: str | None = None

    def _week(self, which: str) -> list[dict]:
        def fn() -> list[dict]:
            r = httpx.get(URLS[which], timeout=20, headers={"User-Agent": "premarket-dashboard/0.1"})
            r.raise_for_status()
            return list(r.json())

        res = fetch_json(f"ff:{which}", fn, ttl_min=180)
        self._ok = self._ok and res.ok
        self._as_of = res.as_of
        self._err = res.error
        return res.value or []

    def get_events(self, start: datetime, end: datetime) -> list[CalEvent]:
        out: list[CalEvent] = []
        for which in ("last", "this", "next"):
            for e in self._week(which):
                try:
                    when = datetime.fromisoformat(e["date"])
                except Exception:  # noqa: BLE001
                    continue
                if when.tzinfo is None:
                    when = when.replace(tzinfo=UTC)
                ny_dt = to_ny(when)
                all_day = ny_dt.time().hour == 0 and ny_dt.time().minute == 0 and e.get("impact") == "Holiday"
                if not (start.astimezone(NY) - timedelta(days=1) <= ny_dt <= end.astimezone(NY) + timedelta(days=1)):
                    continue
                out.append(
                    CalEvent(
                        when=None if all_day else ny_dt,
                        date=ny_dt.date().isoformat(),
                        name=e.get("title", ""),
                        impact=IMPACT.get(e.get("impact", ""), "low"),
                        currency=e.get("country", ""),
                        consensus=e.get("forecast") or None,
                        previous=e.get("previous") or None,
                        actual=e.get("actual") or None,
                        source="forexfactory",
                    )
                )
        return sorted(out, key=lambda x: (x.date, x.when or datetime.min.replace(tzinfo=UTC)))

    def health(self) -> Health:
        return Health(self._ok, self._as_of, None, self._err, "forexfactory")
