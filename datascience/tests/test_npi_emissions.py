import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from integrate_npi_emissions import aggregate_reporting_localities, inverse_presence_score


def test_no_reported_facility_receives_highest_presence_score():
    scores = inverse_presence_score(pd.Series([0, 1, 3]))
    assert scores.iloc[0] == 100
    assert scores.iloc[1] > scores.iloc[2]


def test_missing_count_remains_missing():
    scores = inverse_presence_score(pd.Series([None]))
    assert pd.isna(scores.iloc[0])


def test_npi_counts_aggregate_across_component_sa2s():
    summary = pd.DataFrame({
        "sa2_code": ["1", "2"], "npi_reporting_facility_count": [2, 3]
    })
    bridge = pd.DataFrame({
        "community_id": ["a", "a"], "sa2_code_2021": ["1", "2"]
    })
    localities = pd.DataFrame({
        "community_id": ["a"], "neighbourhood_id": ["1_2"], "community_name": ["A"]
    })

    output = aggregate_reporting_localities(summary, bridge, localities)

    assert output.loc[0, "npi_reporting_facility_count"] == 5
