from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data/processed"
REPORTS = ROOT / "reports"


def test_pha_analysis_uses_only_complete_geographies():
    data = pd.read_csv(PROC / "phidu_environment_pha.csv", dtype={"pha_code_2021": str})
    assert len(data) == 179
    assert data.pha_code_2021.is_unique
    assert set(data.geographic_coverage_status) == {"COMPLETE_COMPONENT_SA2_COVERAGE"}
    assert data.child_population_0_14.gt(0).all()
    assert data.child_asthma_asr_per_100.between(0, 100).all()


def test_hypothesis_family_is_complete_and_multiplicity_adjusted():
    tests = pd.read_csv(REPORTS / "phidu_environment_hypotheses.csv")
    assert list(tests.hypothesis_id) == [f"H{number}" for number in range(1, 8)]
    assert tests.n_phas.eq(179).all()
    assert tests.q_value_bh.ge(tests.p_value_two_sided - 1e-12).all()
    assert tests.q_value_bh.between(0, 1).all()
    assert set(tests.inference_scope) == {"UNADJUSTED_ECOLOGICAL_ASSOCIATION_NOT_CAUSAL"}


def test_analysis_does_not_invent_monitor_based_exposure():
    data = pd.read_csv(PROC / "phidu_environment_pha.csv")
    assert not any("pm2" in column.lower() or "pm10" in column.lower()
                   or "no2" in column.lower() or "ozone" in column.lower()
                   for column in data.columns)
    report = (REPORTS / "PHIDU_ENVIRONMENT_FINDINGS.md").read_text()
    assert "EPA station data are not used" in report
    assert "do not estimate individual exposure" in report
    assert "establish causality" in report
