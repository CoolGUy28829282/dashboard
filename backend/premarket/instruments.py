"""Instrument metadata, contract months, roll and expiry rules (spec section 6)."""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, timedelta

from . import config

MONTH_CODES = {"F": 1, "G": 2, "H": 3, "J": 4, "K": 5, "M": 6, "N": 7, "Q": 8, "U": 9, "V": 10, "X": 11, "Z": 12}
CODE_BY_MONTH = {v: k for k, v in MONTH_CODES.items()}


@dataclass(frozen=True)
class Instrument:
    id: str
    name: str
    yf: str
    tick: float
    tick_value: float
    months: tuple[str, ...]
    roll_rule: str
    smt_partner: str
    smt_tiebreak: str
    intermarket: tuple[str, ...]
    keywords: tuple[str, ...]


def get(instr: str) -> Instrument:
    cfg = config.load("instruments")[instr]
    return Instrument(
        id=instr,
        name=cfg["name"],
        yf=cfg["yf"],
        tick=float(cfg["tick"]),
        tick_value=float(cfg["tick_value"]),
        months=tuple(cfg["months"]),
        roll_rule=cfg["roll_rule"],
        smt_partner=cfg["smt_partner"],
        smt_tiebreak=cfg["smt_tiebreak"],
        intermarket=tuple(cfg["intermarket"]),
        keywords=tuple(cfg["keywords"]),
    )


def all_ids() -> list[str]:
    return [k for k in config.load("instruments") if k != "symbols"]


def nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    first = date(year, month, 1)
    offset = (weekday - first.weekday()) % 7
    return first + timedelta(days=offset + 7 * (n - 1))


def last_business_day(year: int, month: int) -> date:
    d = date(year, month, calendar.monthrange(year, month)[1])
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


@dataclass(frozen=True)
class Contract:
    code: str  # NQZ6
    code_long: str  # NQZ26
    month: int
    year: int
    roll: date  # date on which the front contract changes
    expiry: date  # last trade / expiry
    yf_symbol: str  # NQZ26.CME


def _equity_contract(instr: str, year: int, month: int) -> Contract:
    # Roll on the 2nd Thursday of the expiry month, expire (last trade) the 3rd Friday.
    roll = nth_weekday(year, month, 3, 2)
    expiry = nth_weekday(year, month, 4, 3)
    return Contract(
        code=f"{instr}{CODE_BY_MONTH[month]}{year % 10}",
        code_long=f"{instr}{CODE_BY_MONTH[month]}{year % 100}",
        month=month,
        year=year,
        roll=roll,
        expiry=expiry,
        yf_symbol=f"{instr}{CODE_BY_MONTH[month]}{year % 100}.CME",
    )


def _gold_contract(year: int, month: int) -> Contract:
    # Active months G,J,M,Q,Z. First notice day = last business day of the month before delivery.
    # Volume rolls into the next active month in the last week before first notice; we treat the
    # roll as 3 business days before first notice and expiry as first notice day.
    prev_month = month - 1 or 12
    prev_year = year if month > 1 else year - 1
    first_notice = last_business_day(prev_year, prev_month)
    roll = first_notice
    for _ in range(3):
        roll -= timedelta(days=1)
        while roll.weekday() >= 5:
            roll -= timedelta(days=1)
    return Contract(
        code=f"GC{CODE_BY_MONTH[month]}{year % 10}",
        code_long=f"GC{CODE_BY_MONTH[month]}{year % 100}",
        month=month,
        year=year,
        roll=roll,
        expiry=first_notice,
        yf_symbol=f"GC{CODE_BY_MONTH[month]}{year % 100}.CMX",
    )


def contracts_around(instr: str, d: date) -> list[Contract]:
    ins = get(instr)
    out: list[Contract] = []
    for year in (d.year - 1, d.year, d.year + 1):
        for code in ins.months:
            m = MONTH_CODES[code]
            out.append(_gold_contract(year, m) if ins.roll_rule == "gold_active_month" else _equity_contract(instr, year, m))
    return sorted(out, key=lambda c: (c.year, c.month))


def front_contract(instr: str, d: date) -> Contract:
    """The contract the market treats as front on date d (after the roll date, the next one)."""
    for c in contracts_around(instr, d):
        if d < c.roll:
            return c
    raise RuntimeError("no front contract")


def roll_dates(instr: str, d: date) -> list[date]:
    return [c.roll for c in contracts_around(instr, d)]


def structural_flags(instr: str, d: date) -> list[dict]:
    """Roll / expiry / OPEX / month & quarter end flags for date d."""
    flags: list[dict] = []
    cs = contracts_around(instr, d)
    for i, c in enumerate(cs):
        if c.roll == d:
            nxt = cs[i + 1].code if i + 1 < len(cs) else "the next contract"
            flags.append({"id": "roll", "text": f"{instr} rolls from {c.code} to {nxt} today", "contract": nxt})
        if c.expiry == d:
            what = "first notice" if instr == "GC" else "expiry"
            prev = [x for x in cs if (x.year, x.month) < (c.year, c.month)]
            name = prev[-1].code if prev else c.code
            flags.append({"id": "expiry", "text": f"{name} {what} today", "contract": name})
    third_friday = nth_weekday(d.year, d.month, 4, 3)
    if d == third_friday:
        q = d.month in (3, 6, 9, 12)
        flags.append({"id": "quarterly_opex" if q else "monthly_opex", "text": "Quarterly OPEX" if q else "Monthly OPEX"})
    if d == last_business_day(d.year, d.month):
        flags.append({"id": "quarter_end" if d.month in (3, 6, 9, 12) else "month_end", "text": "Quarter end" if d.month in (3, 6, 9, 12) else "Month end"})
    return flags
