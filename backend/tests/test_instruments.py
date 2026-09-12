from datetime import date

from premarket import instruments


def test_equity_roll_and_expiry_sep_2026():
    fc = instruments.front_contract("NQ", date(2026, 9, 11))
    assert fc.code == "NQZ6" and fc.code_long == "NQZ26"
    prev = [c for c in instruments.contracts_around("NQ", date(2026, 9, 11)) if c.code == "NQU6"][0]
    assert prev.roll == date(2026, 9, 10)  # 2nd Thursday
    assert prev.expiry == date(2026, 9, 18)  # 3rd Friday
    assert instruments.front_contract("ES", date(2026, 9, 9)).code == "ESU6"


def test_structural_flags_week_of_sep_7_2026():
    thu = instruments.structural_flags("NQ", date(2026, 9, 10))
    assert any(f["id"] == "roll" and "NQZ6" in f["text"] for f in thu)
    fri18 = instruments.structural_flags("ES", date(2026, 9, 18))
    ids = {f["id"] for f in fri18}
    assert {"expiry", "quarterly_opex"} <= ids
    assert instruments.structural_flags("NQ", date(2026, 9, 30))[0]["id"] == "quarter_end"


def test_gold_active_month():
    fc = instruments.front_contract("GC", date(2026, 9, 11))
    assert fc.code == "GCZ6"
    assert fc.expiry == date(2026, 11, 30)  # first notice = last business day before December


def test_nth_weekday():
    assert instruments.nth_weekday(2026, 9, 3, 2) == date(2026, 9, 10)
    assert instruments.nth_weekday(2026, 9, 4, 3) == date(2026, 9, 18)
