"""End-to-end on the synthetic fixture day (skipped when fixtures are absent)."""

from datetime import date, datetime

import pytest

from premarket import journal, scan
from premarket.models import Snapshot
from premarket.providers.mock import MockPrices
from premarket.timeutil import NY, at

pytestmark = pytest.mark.usefixtures("fixtures_present")


@pytest.fixture(scope="module")
def nq_0702():
    return scan.run_premarket_scan("NQ", datetime(2026, 9, 11, 7, 2, tzinfo=NY), write=False)


def test_snapshot_schema_roundtrip(nq_0702):
    raw = nq_0702.model_dump_json(by_alias=True)
    snap = Snapshot.model_validate_json(raw)
    assert snap.meta.instrument == "NQ" and snap.meta.contract == "NQZ6"
    assert snap.meta.expiring_contract == "NQU6" and snap.meta.expiring_in_days == 7
    assert snap.rating.label == "Caution" and "UoM" in snap.rating.top_reason
    assert snap.bias.label == "Bullish"
    assert snap.brief.watch.startswith("Watch for a sweep of the 5 AM candle low")
    assert all(f.reason and f.inputs is not None for f in snap.bias.factors)
    assert snap.calendar.week[0].label == "No trade" and "Labor Day" in snap.calendar.week[0].reasons[0]
    assert snap.calendar.week[2].label == "No trade" and "CPI" in snap.calendar.week[2].reasons[0]
    assert any(s["id"] == "roll" for s in snap.calendar.week[3].structural)


def test_every_stat_carries_n_and_dates(nq_0702):
    found = []

    def walk(x):
        if isinstance(x, dict):
            if set(x) >= {"value", "n", "from", "to"}:
                found.append(x)
                if x["value"] is not None:
                    assert x["n"] > 0 and x["from"] and x["to"], x
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)

    walk(nq_0702.model_dump(by_alias=True))
    assert len(found) > 50


def test_red_folder_day_no_setup_bias_still_computed():
    s = scan.run_premarket_scan("NQ", datetime(2026, 9, 9, 7, 2, tzinfo=NY), write=False)
    assert s.rating.label == "No trade" and "CPI" in s.brief.today
    assert s.ideas == []
    assert s.bias.factors and s.bias.label in ("Bullish", "Bearish", "Neutral")
    assert "No setup is presented" in s.brief.watch


def test_in_window_sweep_confirmed_on_each_timeframe():
    s = scan.run_premarket_scan("NQ", datetime(2026, 9, 11, 10, 5, tzinfo=NY), write=False)
    c5 = next(c for c in s.crt.context if c.id == "h4_0500")
    for tf in ("15m", "30m", "1h"):
        sw = c5.by_timeframe[tf].sweeps[0]
        assert sw.side == "low" and sw.at[11:16] == "09:43" and sw.closed_inside is True
        assert sw.candle_close_at[11:16] == "10:00"
    assert c5.by_timeframe["15m"].sweeps[0].reclaim_candles == 1
    by_tf = {x.timeframe: x for x in s.crt.setups if x.scenario == "primary"}
    assert set(by_tf) == {"15m", "30m", "1h"}
    assert all(x.state == "confirmed" and x.direction == "long" for x in by_tf.values())
    assert by_tf["30m"].reclaim_at[11:16] == "09:47"
    assert s.crt.smt is not None and s.crt.smt.divergent and s.crt.smt.side == "low"
    assert by_tf["30m"].odds.reach_eq.n > 0 and by_tf["30m"].odds.reach_eq.from_
    later = scan.run_premarket_scan("NQ", datetime(2026, 9, 11, 10, 40, tzinfo=NY), write=False)
    assert next(x for x in later.crt.setups if x.timeframe == "30m").state == "active"


def test_switching_instruments_changes_everything():
    a = scan.run_premarket_scan("ES", datetime(2026, 9, 11, 7, 2, tzinfo=NY), write=False)
    b = scan.run_premarket_scan("GC", datetime(2026, 9, 11, 7, 2, tzinfo=NY), write=False)
    assert a.meta.contract == "ESZ6" and b.meta.contract == "GCZ6"
    assert a.price.last != b.price.last and a.chart["candles"]["15m"] != b.chart["candles"]["15m"]
    assert {r.symbol for r in b.intermarket.rows} != {r.symbol for r in a.intermarket.rows}


def test_journal_grades_completed_window(nq_0702):
    bars = MockPrices().get_bars("NQ=F", "1m", at(date(2026, 9, 11), "08:00"), at(date(2026, 9, 11), "16:00"))
    g = journal.grade(nq_0702, bars)
    assert g["status"] == "graded"
    assert g["direction_actual"] == "up" and g["bias_correct"] is True
    assert g["scenarios"]["primary"]["triggered_at"][11:16] in ("09:40", "09:41", "09:42", "09:43")
    assert g["scenarios"]["primary"]["first"] == "t2" and g["primary_hit"] is True
    assert isinstance(g["execution_sweeps"], list)
    assert any(x["id"] == "h4_0500_l" for x in g["context_swept"])
