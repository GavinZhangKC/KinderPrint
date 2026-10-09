import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import build_nearby_health_services as nearby
import build_seasonal_air_quality as air

POINTS = pd.DataFrame({
    "sa2_code_2021": ["206011106"], "sa2_name_2021": ["Brunswick East"],
    "label_point_longitude": [144.98], "label_point_latitude": [-37.77],
})


def _daily(station, dates, values, hours=24):
    return pd.DataFrame({
        "station_name": station, "pollutant": "PM2.5", "date_local": dates,
        "daily_mean": values, "valid_hours": hours, "year": [int(d[:4]) for d in dates],
    })


def test_seasonal_air_uses_nearest_eligible_station_and_counts_days_above_standard(monkeypatch):
    monkeypatch.setattr(air, "MIN_STATION_DAYS", 3)
    daily = pd.concat([
        _daily("Near", ["2020-01-14", "2020-01-15", "2020-07-01"], [30.0, 10.0, 26.0]),
        _daily("Near", ["2020-07-02"], [99.0], hours=10),  # incomplete day is ignored
        _daily("Far", ["2020-01-01", "2020-01-02", "2020-01-03"], [1.0, 1.0, 1.0]),
        _daily("Close but sparse", ["2020-01-01"], [50.0]),
    ])
    stations = pd.DataFrame({
        "station_name": ["Near", "Far", "Close but sparse"],
        "latitude": [-37.80, -38.50, -37.77], "longitude": [144.96, 145.50, 144.98],
    })
    out = air.build(daily, stations, POINTS, pd.Series(["206011106"]))
    assert set(out.station_name) == {"Near"}
    jan = out.set_index("month").loc[1]
    assert jan.valid_days == 2 and jan.days_above_standard == 1
    assert jan.highest_daily_date == "2020-01-14"
    jul = out.set_index("month").loc[7]
    assert jul.valid_days == 1 and jul.days_above_standard == 1
    assert (out.interpretation == "MONITOR_OBSERVATION_ONLY_NOT_SA2_EXPOSURE").all()


def test_seasonal_air_rejects_sa2_without_label_point():
    daily = _daily("Near", ["2020-01-01"] * 1, [1.0])
    stations = pd.DataFrame({"station_name": ["Near"], "latitude": [-37.8], "longitude": [145.0]})
    with pytest.raises(ValueError):
        air.build(daily, stations, POINTS, pd.Series(["999999999"]))


def test_nearby_services_reports_nearest_per_type_and_count_within_radius():
    facilities = pd.DataFrame({
        "facility_id": ["a", "b", "c", "d"],
        "facility_name": ["Close GP", "Far GP", "Children's ED", "Closed GP"],
        "facility_category": ["general_practice", "general_practice", "hospital", "general_practice"],
        "official_service_type": ["General practice service", "General practice service",
                                  "Emergency department service", "General practice service"],
        "operational_status": ["active", "active", "active", "inactive"],
        "address": ["1 A St", "2 B St", "3 C St", "4 D St"],
        "latitude": [-37.771, -37.95, -37.79, -37.770],
        "longitude": [144.981, 144.98, 144.95, 144.980],
        "source_date": "2025-03-07",
    })
    out = nearby.build(facilities, POINTS, pd.Series(["206011106"])).set_index("service_type")
    gp = out.loc["General practice service"]
    assert gp.nearest_name == "Close GP"
    assert gp.count_within_5km == 1
    assert out.loc["Emergency department service"].nearest_distance_km == pytest.approx(3.6, abs=0.3)
