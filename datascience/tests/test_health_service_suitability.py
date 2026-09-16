import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from build_health_service_suitability import build_service_measures


def test_component_sa2_counts_are_aggregated_and_population_adjusted():
    counts = pd.DataFrame({
        "sa2_code": ["1", "2", "3"],
        "general_practice_count": [1, 2, 1],
        "hospital_count": [0, 1, 0],
        "pharmacy_count": [2, 1, 1],
    })
    bridge = pd.DataFrame({"community_id": ["a", "a", "b"], "sa2_code_2021": ["1", "2", "3"]})
    localities = pd.DataFrame({
        "community_id": ["a", "b"], "neighbourhood_id": ["1_2", "3"],
        "community_name": ["A", "B"], "population": [20_000, 5_000],
    })

    output, qa = build_service_measures(counts, bridge, localities)

    area_a = output.set_index("community_id").loc["a"]
    assert area_a.general_practice_count == 3
    assert area_a.general_practice_per_10000 == 1.5
    assert qa["category_totals"]["general_practice"] == 4


def test_zero_facility_count_remains_a_valid_zero_rate():
    counts = pd.DataFrame({
        "sa2_code": ["1"], "general_practice_count": [0],
        "hospital_count": [0], "pharmacy_count": [0],
    })
    bridge = pd.DataFrame({"community_id": ["a"], "sa2_code_2021": ["1"]})
    localities = pd.DataFrame({
        "community_id": ["a"], "neighbourhood_id": ["1"],
        "community_name": ["A"], "population": [1000],
    })

    output, _ = build_service_measures(counts, bridge, localities)

    assert output.loc[0, "hospital_per_10000"] == 0
    assert output.loc[0, "hospital_access_score"] == 0
