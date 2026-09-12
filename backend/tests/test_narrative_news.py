from premarket import narrative, news
from premarket.providers.base import Headline
from premarket.timeutil import now_utc


def test_llm_numbers_must_exist_in_payload():
    payload = {"levels": {"pdh": 24240, "pdl": 24088.5}, "bias": {"confidence": 68}}
    ok, why = narrative.validate(
        {"narrative": "Target 24,240 then 24,088.5 with 68% confidence.", "summary": "x", "movers": []}, narrative.NARRATIVE_SCHEMA, payload
    )
    assert ok, why
    ok, why = narrative.validate({"narrative": "Target 24,300.", "summary": "x", "movers": []}, narrative.NARRATIVE_SCHEMA, payload)
    assert not ok and "24300" in why
    ok, why = narrative.validate({"narrative": "x", "movers": []}, narrative.NARRATIVE_SCHEMA, payload)
    assert not ok and "summary" in why


def test_dedupe_and_sentiment():
    t = now_utc()
    items = [
        Headline("Stocks rally to record", "https://a/1", t, "A", "a"),
        Headline("Stocks Rally to Record!", "https://b/2", t, "B", "b"),
        Headline("Oil slumps on recession fear", "https://c/3", t, "C", "c"),
    ]
    out = news.dedupe(items)
    assert len(out) == 2
    assert news.sentiment("Stocks rally to record", "NQ")[0] == "bullish"
    assert news.sentiment("Oil slumps on recession fear", "NQ")[0] == "bearish"
    assert news.sentiment("Gold jumps as dollar weakens, safe haven bid", "GC")[0] == "bullish"
