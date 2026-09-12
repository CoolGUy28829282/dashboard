from premarket import config
from premarket.bias import engine, evidence
from premarket.bias.factors import FactorResult
from premarket.models import Modifier


def fr(fid, score, cond="c"):
    return FactorResult(fid, score, cond, "reason.", {})


def test_shrinkage():
    assert evidence.shrink(0.7, 20, 20) == 0.6
    assert abs(evidence.shrink(1.0, 0, 20) - 0.5) < 1e-9


def test_score_math_and_renormalisation():
    res = {
        "overnight_structure": fr("overnight_structure", 1.0),
        "htf_context": fr("htf_context", 1.0),
        "crt_state": None,
        "intermarket": None,
        "news_sentiment": None,
        "weekday_tendency": None,
    }
    b = engine.score("NQ", res, {"tables": {}}, [], None, {})
    assert abs(sum(f.weight for f in b.factors) - 1.0) < 1e-9
    assert b.label == "Bullish" and b.confidence == 95  # S=1 → 100, capped
    assert len(b.excluded) == 4
    assert "renormal" in b.confidence_math or "S = " in b.confidence_math


def test_thresholds_and_neutral():
    res = {"overnight_structure": fr("overnight_structure", 0.1), "htf_context": fr("htf_context", -0.1)}
    b = engine.score("NQ", res, {"tables": {}}, [], None, {})
    assert b.label == "Neutral" and b.confidence == round(50 + 50 * abs(b.score))


def test_disagreement_penalty_and_modifiers():
    res = {"overnight_structure": fr("overnight_structure", 0.8), "htf_context": fr("htf_context", -0.4)}
    b = engine.score("NQ", res, {"tables": {}}, [Modifier(id="calendar_risk", penalty=8, reason="x")], None, {})
    assert b.agreement_penalty == 10
    S = (0.25 * 0.8 - 0.2 * 0.4) / 0.45
    assert abs(b.score - S) < 1e-3
    assert b.confidence == round(50 + 50 * abs(S) - 10 - 8)


def test_evidence_switch_requires_n30():
    cfg = config.load("bias_weights")["evidence"]
    tbl = {"tables": {"overnight_structure": {"swept": {"n": 29, "p": 0.9}, "swept_many": {"n": 40, "p": 0.9}}}}
    b = engine.score("NQ", {"overnight_structure": fr("overnight_structure", 0.2, "swept")}, tbl, [], None, {})
    assert b.factors[0].source == "heuristic" and b.factors[0].score == 0.2
    b = engine.score("NQ", {"overnight_structure": fr("overnight_structure", 0.2, "swept_many")}, tbl, [], None, {})
    f = b.factors[0]
    assert f.source == "evidence" and f.n == 40
    p_hat = (cfg["shrink_k"] * 0.5 + 40 * 0.9) / (cfg["shrink_k"] + 40)
    assert abs(f.score - (2 * p_hat - 1)) < 1e-3
    assert "40 similar mornings" in f.reason


def test_gc_overrides():
    w = engine.weights_for("GC")
    assert w["intermarket"] == 0.25 and w["weekday_tendency"] == 0.05
