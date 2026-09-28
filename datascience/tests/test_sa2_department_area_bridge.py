import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from build_sa2_department_area_bridge import AREA_LGAS, SA2_LGA, build, normalise_lga


def test_normalise_lga_drops_publisher_suffixes():
    assert normalise_lga("Bayside (Vic.)") == normalise_lga("Bayside (C)") == "bayside"
    assert normalise_lga("Merri-bek") == "merri-bek"


def test_every_victorian_sa2_except_unincorporated_reaches_a_department_area():
    result = build(pd.read_csv(SA2_LGA, dtype=str), pd.read_csv(AREA_LGAS, dtype=str))
    assert result.department_area.nunique() == 17
    assert result.sa2_code_2021.is_unique
    brunswick_east = result.set_index("sa2_code_2021").loc["206011106"]
    assert brunswick_east.lga_name_2023 == "Merri-bek"
    assert brunswick_east.department_area == "Hume Moreland"


def test_unknown_lga_is_rejected():
    sa2 = pd.DataFrame({"sa2_code_2021": ["1"], "sa2_name_2021": ["X"],
                        "lga_code_2023": ["1"], "lga_name_2023": ["Nowhere"]})
    with pytest.raises(ValueError):
        build(sa2, pd.read_csv(AREA_LGAS, dtype=str))


def test_processed_bridge_covers_every_greater_melbourne_community():
    bridge = pd.read_csv(ROOT / "data" / "processed" / "sa2_department_area_bridge.csv", dtype=str)
    communities = pd.read_csv(ROOT / "data" / "processed" / "communities.csv", dtype=str)
    component_sa2s = {code for merged in communities.aedc_area_code for code in merged.split("/")}
    missing = component_sa2s - set(bridge.sa2_code_2021)
    assert not missing
