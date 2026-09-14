import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data/processed"
OUT = ROOT / "outputs/iteration_2"


def test_phidu_bridge_allocates_each_victorian_sa2_once():
    bridge = pd.read_csv(PROC / "phidu_pha_sa2_bridge.csv",
                         dtype={"sa2_code_2021": str, "pha_code_2021": str})
    assert len(bridge) == 522
    assert bridge.sa2_code_2021.is_unique
    assert bridge.pha_code_2021.nunique() == 276
    assert bridge.sa2_code_2021.str.match(r"^2\d{8}$").all()


def test_phidu_outcomes_remain_at_pha_geography():
    data = pd.read_csv(PROC / "phidu_child_health_pha.csv",
                       dtype={"pha_code_2021": str})
    assert len(data) == 276 * 12
    assert not data.duplicated(["pha_code_2021", "indicator_id"]).any()
    assert "sa2_code_2021" not in data.columns
    assert data.geography_warning.str.contains("must not be assigned").all()
    assert set(data.publication_status) <= {"PUBLISHED", "SUPPRESSED", "MISSING", "NOT_APPLICABLE"}


def test_phidu_suppression_is_not_converted_to_zero():
    data = pd.read_csv(PROC / "phidu_child_health_pha.csv")
    suppressed = data[data.publication_status.eq("SUPPRESSED")]
    assert len(suppressed) > 0
    assert suppressed.rate_or_percent.isna().all()


def test_phidu_report_enforces_research_boundary_and_licence():
    report = json.loads((OUT / "phidu_child_health_validation.json").read_text())
    assert report["product_status"] == "VALIDATED_RESEARCH_CONTEXT_ONLY"
    assert report["licence"] == "CC BY-NC-SA 3.0 Australia"
    assert "never disaggregate" in report["geographic_rule"]
