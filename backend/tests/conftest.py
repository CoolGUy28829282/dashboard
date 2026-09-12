import os
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault("DATA_DIR", str(ROOT / "data"))
os.environ["PROVIDER_PRICES"] = "mock"
os.environ["PROVIDER_CALENDAR"] = "mock"
os.environ["PROVIDER_NEWS"] = "mock"
os.environ["PROVIDER_SERIES"] = "mock"
os.environ["PROVIDER_LLM"] = "rules"


@pytest.fixture(scope="session")
def fixtures_present() -> bool:
    return (ROOT / "data" / "fixtures" / "bars" / "NQF_5m.parquet").exists()
