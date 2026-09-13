import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data/processed"
OUT = ROOT / "outputs/iteration_2"


def test_vif_projection_contract_is_complete_and_labelled():
    data = pd.read_csv(PROC / "vif_child_population_projections_sa2.csv",
                       dtype={"sa2_code_2021": str})
    assert len(data) == 522 * 4 * 3
    assert not data.duplicated(["sa2_code_2021", "projection_year", "sex"]).any()
    assert set(data.projection_year) == {2021, 2026, 2031, 2036}
    assert set(data.sex) == {"persons", "males", "females"}
    assert set(data.value_status) == {"PROJECTED"}
    assert data.filter(like="population_").ge(0).all().all()


def test_vif_persons_equal_sex_components():
    data = pd.read_csv(PROC / "vif_child_population_projections_sa2.csv")
    values = [column for column in data if column.startswith("population_")]
    keyed = data.set_index(["sa2_code_2021", "projection_year", "sex"])
    people = keyed.xs("persons", level="sex")[values]
    components = (keyed.xs("males", level="sex")[values]
                  + keyed.xs("females", level="sex")[values])
    assert (abs(people.to_numpy() - components.to_numpy()) < 0.00001).all()


def test_vif_report_prevents_false_exact_age_claim():
    report = json.loads((OUT / "vif2023_validation.json").read_text())
    assert report["persons_equals_males_plus_females"] is True
    assert "0-5" in report["age_warning"]
    assert "without estimation" in report["age_warning"]
