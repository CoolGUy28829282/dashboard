from datetime import datetime

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from premarket import cli, history
from premarket.timeutil import NY

pytestmark = pytest.mark.usefixtures("fixtures_present")


def test_api_roundtrip(tmp_path, monkeypatch):
    from premarket import api

    c = TestClient(api.app)
    assert c.get("/api/health").json()["ok"]
    r = c.post("/api/scan", json={"instrument": "NQ", "asof": datetime(2026, 9, 11, 7, 2, tzinfo=NY).isoformat()})
    assert r.status_code == 200 and r.json()["ok"]
    snap = c.get("/api/snapshot/NQ").json()
    assert snap["meta"]["instrument"] == "NQ" and snap["brief"]["today"]
    clock = c.get("/api/clock").json()
    assert clock["milestone"]["seconds"] >= 0
    j = c.put("/api/journal/NQ/2026-09-11", json={"notes": "test note", "checklist": {"0": True}}).json()
    assert j["notes"] == "test note" and j["checklist"]["0"] is True
    g = c.post("/api/post-session/NQ", params={"date_": "2026-09-11"}).json()
    assert g["status"] == "graded" and g["bias_correct"] is True
    board = c.get("/api/scoreboard/NQ").json()
    assert board["n"] >= 1 and board["windows"]["20"]["bias_accuracy"]["n"] >= 1
    s = c.get("/api/settings").json()
    assert "bias_weights" in s and s["bias_weights"]["default"]["overnight_structure"] == 0.25
    assert c.put("/api/settings/instruments", json={}).status_code == 400
    assert c.get("/api/snapshot/XX").status_code == 404


def test_csv_import_into_history(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    csv = tmp_path / "nq.csv"
    pd.DataFrame({"time": ["2026-09-11 09:30:00", "2026-09-11 09:31:00"], "open": [1, 2], "high": [2, 3], "low": [0, 1], "close": [1.5, 2.5], "Volume": [10, 20]}).to_csv(csv, index=False)
    cli.main(["import", str(csv), "--instrument", "NQ", "--interval", "1m"])
    df = history.load("NQ=F", "1m")
    assert len(df) == 2 and df.index[0].tz_convert(NY).strftime("%H:%M") == "09:30"
    cli.main(["import", str(csv), "--instrument", "NQ", "--interval", "1m"])
    assert len(history.load("NQ=F", "1m")) == 2  # deduplicated
