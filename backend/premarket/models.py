"""Snapshot models. Source of truth; `premarket types` emits frontend/src/types/snapshot.ts from these."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Impact = Literal["high", "medium", "low", "holiday"]
BiasLabel = Literal["Bullish", "Bearish", "Neutral"]
RatingLabel = Literal["Trade", "Caution", "No trade"]
Timeframe = Literal["15m", "30m", "1h"]
Phase = Literal["range", "manipulation", "manipulation_confirmed", "distribution", "complete", "expansion", "invalidated"]
SetupState = Literal["pending", "confirmed", "active", "done", "invalidated", "watch"]


class Stat(BaseModel):
    """Every historical statistic. The UI refuses to render one that lacks any of these."""

    value: float | None
    n: int
    from_: str | None = Field(default=None, alias="from")
    to: str | None = None
    unit: str = ""
    model_config = {"populate_by_name": True}


class SourceHealth(BaseModel):
    ok: bool
    as_of: str | None = None
    delay_min: int | None = None
    error: str | None = None
    source: str = ""


class Meta(BaseModel):
    instrument: str
    instrument_name: str
    contract: str
    contract_long: str
    contract_expiry: str
    contract_roll: str
    days_to_roll: int
    days_to_expiry: int
    expiring_contract: str | None = None  # the previous front contract when it has not expired yet
    expiring_in_days: int | None = None
    generated_at: str
    trading_date: str
    weekday: str
    anchor: str
    window: dict[str, str]
    milestones: list[str]
    health: dict[str, SourceHealth]
    data_source: str = "live"  # live | fixtures | synthetic
    price_delay_min: int | None = None
    roll_warning: str | None = None
    tick: float


class Brief(BaseModel):
    today: str
    bias: str
    watch: str


class Price(BaseModel):
    last: float | None
    as_of: str | None
    delay_min: int | None
    vs_prev_close: float | None
    vs_midnight_open: float | None
    vs_daily_open: float | None


class Range(BaseModel):
    h: float | None = None
    l: float | None = None
    o: float | None = None
    c: float | None = None
    eq: float | None = None
    start: str | None = None
    end: str | None = None


class LevelRow(BaseModel):
    id: str
    name: str
    price: float
    distance: float
    state: Literal["untested", "swept"] = "untested"
    swept_at: str | None = None
    kind: str = "level"


class Levels(BaseModel):
    pdh: float | None = None
    pdl: float | None = None
    pdc: float | None = None
    pwh: float | None = None
    pwl: float | None = None
    daily_open: float | None = None
    midnight_open: float | None = None
    open_0830: float | None = None
    open_0900: float | None = None
    open_0930: float | None = None
    weekly_open: float | None = None
    monthly_open: float | None = None
    sessions: dict[str, Range] = {}
    above: list[LevelRow] = []
    below: list[LevelRow] = []


class SessionStat(BaseModel):
    range: float | None
    avg20: Stat
    pct_of_avg: float | None
    start: str | None = None
    end: str | None = None
    direction: str | None = None


class Sweep(BaseModel):
    side: Literal["high", "low"]
    at: str
    depth_ticks: float
    pct: float
    key_time: bool
    closed_inside: bool | None = None
    reclaimed_at: str | None = None
    candle_close_at: str | None = None
    extreme: float
    reclaim_candles: int = 0


class TFState(BaseModel):
    phase: Phase
    sweeps: list[Sweep] = []


class ContextRange(BaseModel):
    id: str
    label: str
    kind: Literal["context", "session", "execution"]
    timeframe: str | None = None
    o: float | None = None
    h: float | None = None
    l: float | None = None
    c: float | None = None
    eq: float | None = None
    start: str | None = None
    end: str | None = None
    live: bool = False
    sweeps: list[Sweep] = []
    phase: Phase = "range"
    readable: bool = True
    reached_eq_at: str | None = None
    reached_opposite_at: str | None = None
    invalidated_at: str | None = None
    by_timeframe: dict[str, TFState] = {}


class ExecutionTF(BaseModel):
    timeframe: Timeframe
    range: ContextRange | None
    state: SetupState | None
    closes_at: str | None
    sequence_phase: str
    note: str


class Odds(BaseModel):
    reach_eq: Stat
    reach_opposite: Stat
    invalidated: Stat
    close_inside_given_sweep: Stat
    median_min_to_t1: Stat
    median_min_to_t2: Stat


class Setup(BaseModel):
    id: str
    timeframe: Timeframe
    template: str
    scenario: Literal["primary", "alternate", "counter"]
    state: SetupState
    direction: Literal["long", "short"]
    range_id: str
    range_label: str
    sweep_side: Literal["high", "low"]
    sweep_level: float
    sweep_at: str | None
    reclaim_at: str | None
    candle_close_at: str | None
    earliest_entry_at: str | None
    trigger: str
    confirmation: str
    entry_zone: list[float]
    entry_note: str
    stop: float
    t1: float
    t2: float
    t3: float | None
    rr_t2: float | None
    quality: int
    quality_reasons: list[str]
    odds: Odds
    odds_scope: str
    valid_until: str
    invalidation: str
    smt: dict[str, Any] | None = None
    premium_discount: str | None = None
    counter_bias: bool = False
    warning: str | None = None
    sentence: str


class SMT(BaseModel):
    pair: str
    tiebreak: str | None
    divergent: bool
    side: Literal["high", "low"] | None
    at: str | None
    detail: str


class Template(BaseModel):
    id: str
    name: str
    definition: str
    live: bool
    state: str
    hit_rate: Stat
    by_weekday: dict[str, Stat] = {}


class CRT(BaseModel):
    context: list[ContextRange]
    execution: dict[str, ExecutionTF]
    setups: list[Setup]
    smt: SMT | None
    premium_discount: dict[str, str]
    liquidity: list[LevelRow]
    templates: list[Template]
    atr: dict[str, float | None]
    as_of: str | None


class Factor(BaseModel):
    id: str
    label: str
    score: float
    weight: float
    weight_raw: float
    source: Literal["evidence", "heuristic"]
    condition: str | None
    p_hat: float | None
    n: int | None
    reason: str
    inputs: dict[str, Any]


class Excluded(BaseModel):
    id: str
    label: str
    why: str


class Modifier(BaseModel):
    id: str
    penalty: float
    reason: str


class Scenario(BaseModel):
    name: str
    direction: Literal["long", "short"]
    trigger: str
    confirmation: str
    entry_zone: str
    target: str
    invalidation: str
    valid: str
    setup_id: str | None = None


class SimilarMornings(BaseModel):
    n: int
    up: int
    down: int
    median_move: float | None
    reached_pdh: int
    reached_pdl: int
    dates: list[str]
    text: str


class Bias(BaseModel):
    label: BiasLabel
    score: float
    confidence: int
    confidence_raw: float
    confidence_math: str
    factors: list[Factor]
    excluded: list[Excluded]
    modifiers: list[Modifier]
    similar_mornings: SimilarMornings | None
    narrative: str
    narrative_source: str
    scenarios: dict[str, Scenario | None]
    no_trade: list[str]
    flip_if: list[str]
    thresholds: dict[str, float]
    agreement_penalty: float


class RatingReason(BaseModel):
    id: str
    tier: Literal["no_trade", "caution", "trade"]
    text: str


class Rating(BaseModel):
    label: RatingLabel
    top_reason: str
    reasons: list[RatingReason]
    plan: str
    rules_checked: list[str]


class CalEventOut(BaseModel):
    date: str
    time: str | None
    when: str | None
    name: str
    impact: Impact
    currency: str
    consensus: str | None = None
    previous: str | None = None
    actual: str | None = None
    in_window: bool = False


class DayCard(BaseModel):
    date: str
    weekday: str
    label: RatingLabel
    reasons: list[str]
    events: list[CalEventOut]
    structural: list[dict[str, Any]]
    stats: dict[str, Stat]
    is_today: bool
    rank: int | None


class Calendar(BaseModel):
    today: list[CalEventOut]
    week: list[DayCard]
    month: list[DayCard]
    structural: dict[str, Any]
    as_of: str | None


class HeadlineOut(BaseModel):
    title: str
    url: str
    published: str | None
    source: str
    feed_id: str
    relevance: float
    tags: list[str]
    sentiment: Literal["bullish", "bearish", "neutral"]
    why: str | None = None
    pinned: bool = False


class News(BaseModel):
    summary: str
    summary_source: str
    movers: list[str]
    movers_source: str
    headlines: list[HeadlineOut]
    groups: dict[str, list[HeadlineOut]]
    feeds: list[dict[str, Any]]
    sentiment_score: float | None
    as_of: str | None


class IntermarketRow(BaseModel):
    symbol: str
    name: str
    last: float | None
    chg_since_1700: float | None
    chg_since_midnight: float | None
    pct_since_1700: float | None
    sparkline: list[float]
    read: str
    as_of: str | None


class Intermarket(BaseModel):
    rows: list[IntermarketRow]
    real_yield: dict[str, Any] | None
    breakeven: dict[str, Any] | None
    as_of: str | None


class Stats(BaseModel):
    weekday_window: dict[str, Any]
    crt: dict[str, Any]
    lookback: dict[str, Any]


class Snapshot(BaseModel):
    meta: Meta
    brief: Brief
    price: Price
    levels: Levels
    sessions: dict[str, SessionStat]
    crt: CRT
    bias: Bias
    rating: Rating
    ideas: list[Setup]
    calendar: Calendar
    news: News
    intermarket: Intermarket
    stats: Stats
    key_times: list[dict[str, Any]]
    chart: dict[str, Any]


class JournalDay(BaseModel):
    date: str
    instrument: str
    notes: str = ""
    checklist: dict[str, bool] = {}
    grade: dict[str, Any] | None = None
