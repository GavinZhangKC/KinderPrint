"""Your area in 2031: future endpoints."""
from pathlib import Path

import pytest

from core.data_loader import CARE_CONTEXT_ENV
from loaders import care_context

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "datascience" / "data" / "processed" / "future_demand_sa2.csv"


@pytest.fixture
def live(monkeypatch):
    monkeypatch.setenv(CARE_CONTEXT_ENV["future_demand"], str(DATA))
    care_context.load.cache_clear() if hasattr(care_context.load, "cache_clear") else None
    yield


def test_area_returns_four_years_in_order(client, live):
    body = client.get("/api/future/area?sa2_code=206011106").json()
    assert body["status"] == "available"
    years = [r["projection_year"] for r in body["data"]["years"]]
    assert years == [2021, 2026, 2031, 2036]
    assert body["data"]["years"][2]["ecec_places_to_keep_2026_access"] >= 0
    assert "held fixed" in body["metadata"]["method"]


def test_unknown_area(client, live):
    body = client.get("/api/future/area?sa2_code=999999999").json()
    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "unknown_area"


def test_overview_is_compact_and_covers_every_area(client, live):
    rows = client.get("/api/future/overview").json()["data"]["rows"]
    assert len(rows) == 361 * 4
    assert set(rows[0]) == set(care_context.FUTURE_OVERVIEW)


def test_unconfigured(client):
    body = client.get("/api/future/overview").json()
    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "future_demand_not_configured"


def test_bad_code_rejected(client):
    assert client.get("/api/future/area?sa2_code=abc").status_code == 422
