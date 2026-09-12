from datetime import date

from premarket import config, rating
from premarket.providers.base import CalEvent
from premarket.timeutil import at


def ev(d, t, name, impact, cur="USD"):
    return CalEvent(at(d, t) if t else None, d.isoformat(), name, impact, cur)


def base(d, events, conf=70, label="Bullish", **kw):
    args = dict(
        date=d,
        events=events,
        holiday=None,
        early_close=None,
        confidence=conf,
        bias_label=label,
        sources_down=[],
        structural=[],
        overnight_pct=100.0,
        es_nq_conflict=None,
        weekday_bottom_quartile=False,
        no_readable_range=False,
        contract="NQZ6",
    )
    args.update(kw)
    return rating.RatingInputs(**args)


def test_red_folder_any_time_is_no_trade():
    d = date(2026, 9, 9)
    r = rating.rate(base(d, [ev(d, "08:30", "CPI m/m", "high"), ev(d, "14:00", "Late thing", "high")]))
    assert r.label == "No trade" and "CPI" in r.top_reason
    assert [x.id for x in r.reasons].count("red_folder_event") == 2


def test_red_folder_scope_before_1200(monkeypatch):
    d = date(2026, 9, 9)
    cfg = dict(config.load("rating"))
    cfg["red_folder"] = {"scope": "before_1200", "currencies": ["USD"]}
    monkeypatch.setattr(
        config, "load", lambda name, _c=cfg: _c if name == "rating" else config.load.__wrapped__(name) if hasattr(config.load, "__wrapped__") else _orig(name)
    )
    r = rating.rate(base(d, [ev(d, "14:00", "FOMC", "high")]))
    assert r.label == "Trade"


_orig = config.load


def test_foreign_red_folder_is_not_no_trade():
    d = date(2026, 9, 11)
    r = rating.rate(base(d, [ev(d, "02:00", "GDP", "high", "GBP")]))
    assert r.label == "Trade"


def test_caution_rules_in_order():
    d = date(2026, 9, 11)
    r = rating.rate(base(d, [ev(d, "10:00", "UMich", "medium")], structural=[{"id": "roll", "text": "NQ rolls"}], overnight_pct=30.0, label="Neutral"))
    assert r.label == "Caution"
    ids = [x.id for x in r.reasons]
    assert ids == ["orange_event", "roll_or_expiry", "overnight_range", "neutral_bias"]


def test_low_confidence_and_holiday():
    d = date(2026, 9, 7)
    assert rating.rate(base(d, [], holiday="Labor Day")).label == "No trade"
    assert rating.rate(base(d, [], conf=45)).label == "No trade"
    r = rating.rate(base(date(2026, 9, 11), [], conf=55))
    assert r.label == "Caution" and r.reasons[-1].id == "confidence_below_trade"
