import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from integrate_vcams_child_health import build_area, build_lga, quality_from_rse


def test_rse_quality_rules_match_vcams_definition():
    assert quality_from_rse(0.249) == "available"
    assert quality_from_rse(0.25) == "use_with_caution"
    assert quality_from_rse(0.50) == "use_with_caution"
    assert quality_from_rse(0.501) == "unreliable"


def test_area_builder_preserves_broad_geography(tmp_path, monkeypatch):
    frame = pd.DataFrame({
        "Year": [2021, 2021],
        "Population group": ["Hume Moreland", "Victoria"],
        "Indicator calculation": [0.42, 0.50],
        "RSE": [0.10, 0.10],
    })
    monkeypatch.setattr(pd, "read_excel", lambda *_args, **_kwargs: frame)
    result = build_area(tmp_path)
    assert set(result.area_name) == {"Hume Moreland"}
    assert set(result.geography) == {"Victorian Department area"}
    assert set(result.percent) == {42.0}
    assert result.geography_warning.str.contains("must not be presented as an SA2").all()


def test_lga_builder_keeps_suppression_and_lga_identity(tmp_path, monkeypatch):
    frame = pd.DataFrame({
        "Year": [2021, 2021], "Financial Year": ["2020_21", "2020_21"],
        "LGA_KEY": [24780, 25250], "LGA_DESC": ["Merri-bek (C)", "Moreland (C)"],
        "Numerator": [41, "NDP"], "Denominator": [343, "NDP"],
        "Indicator": [41 / 343, "NDP"], "Indicator_Calc": [41 / 343, "NDP"],
        "Indicator calculation": [41 / 343, "NDP"],
    })
    monkeypatch.setattr(pd, "read_excel", lambda *_args, **_kwargs: frame)
    result = build_lga(tmp_path)
    assert set(result.geography) == {"Victorian Local Government Area"}
    assert "suppressed" in set(result.publication_status)
    assert result.geography_warning.str.contains("must not be presented as an SA2").all()
