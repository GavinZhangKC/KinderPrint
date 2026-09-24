import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from integrate_abs_child_health import CONDITIONS, build


def test_g19_build_preserves_sa2_and_uses_published_child_denominator(tmp_path):
    a_fields = {field: [value] for field, value in [("P_Asthma_0_14", 10), ("P_Cancer_0_14", 1),
                ("P_Diabetes_0_14", 2), ("P_Heart_disease_0_14", 3)]}
    b_fields = {field: [value] for field, value in [("P_Kidney_disease_0_14", 4), ("P_Lung_cond_0_14", 5),
                ("P_Mental_health_cond_0_14", 6), ("P_Other_0_14", 7), ("P_None_0_14", 80)]}
    pd.DataFrame({"SA2_CODE_2021": ["206011106"], **a_fields}).to_csv(tmp_path / "2021Census_G19A_VIC_SA2.csv", index=False)
    pd.DataFrame({"SA2_CODE_2021": ["206011106"], **b_fields}).to_csv(tmp_path / "2021Census_G19B_VIC_SA2.csv", index=False)
    pd.DataFrame({"SA2_CODE_2021": ["206011106"], "P_Tot_0_14": [100]}).to_csv(tmp_path / "2021Census_G19C_VIC_SA2.csv", index=False)
    lookup = tmp_path / "lookup.csv"
    pd.DataFrame({"SA2_CODE_2021": ["206011106"], "SA2_NAME_2021": ["Brunswick East"],
                  "SA3_CODE_2021": ["20601"], "SA3_NAME_2021": ["Brunswick - Coburg"],
                  "GCCSA_NAME_2021": ["Greater Melbourne"]}).to_csv(lookup, index=False)

    result = build(tmp_path, lookup)

    assert len(result) == len(CONDITIONS)
    asthma = result[result.indicator.eq("asthma")].iloc[0]
    assert asthma["sa2_name_2021"] == "Brunswick East"
    assert asthma["count"] == 10
    assert asthma["population_denominator"] == 100
    assert asthma["percent"] == 10.0
    assert asthma["geography"] == "SA2 (ASGS Edition 3, 2021)"
