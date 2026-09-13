import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data/processed"
OUT = ROOT / "outputs/iteration_2"


def daily():
    return pd.read_csv(PROC / "epa_air_quality_station_daily.csv", low_memory=False)


def test_epa_daily_contract_covers_all_years_and_pollutants():
    data = daily()
    assert set(data.year) == set(range(2018, 2026))
    assert set(data.pollutant) == {"PM2.5", "PM10", "NO2", "O3"}
    assert data.station_name.nunique() == 21
    assert not data.duplicated(
        ["year", "station_id", "date_local", "pollutant", "unit", "method_code", "validation_status"]
    ).any()


def test_epa_units_and_hourly_cardinality_are_not_silently_mixed():
    data = daily()
    assert set(data.loc[data.pollutant.isin(["PM2.5", "PM10"]), "unit"]) == {"ug/m3"}
    assert set(data.loc[data.pollutant.isin(["NO2", "O3"]), "unit"]) == {"ppb"}
    assert data.valid_hours.between(1, 24).all()
    assert data.negative_hours_retained.ge(0).all()


def test_epa_outputs_make_no_sa2_exposure_claim():
    data = daily()
    annual = pd.read_csv(PROC / "epa_air_quality_station_year.csv", low_memory=False)
    assert "sa2_code_2021" not in data.columns
    assert "sa2_code_2021" not in annual.columns
    assert set(data.interpretation_scope) == {"MONITOR_OBSERVATION_ONLY_NOT_SA2_EXPOSURE"}
    assert set(annual.sa2_exposure_status) == {"NOT_DERIVED"}


def test_epa_validation_report_reconciles_quality_controls():
    data = daily()
    report = json.loads((OUT / "epa_airwatch_validation.json").read_text())
    assert report["valid_hourly_observations"] == int(data.valid_hours.sum())
    assert report["exact_duplicate_source_rows_removed"] > 0
    assert report["conflicting_source_observations_excluded"] > 0
    assert report["sa2_exposure_values_created"] == 0
    assert report["product_status"].endswith("INSUFFICIENT_FOR_LOCALITY_EXPOSURE")
