import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from integrate_healthdirect_facilities import category_from_filename


def test_healthdirect_layer_categories_are_explicit():
    assert category_from_filename(Path("general_practice.geojson")) == "general_practice"
    assert category_from_filename(Path("general_practice_page2.geojson")) == "general_practice"
    assert category_from_filename(Path("hospital.geojson")) == "hospital"
    assert category_from_filename(Path("pharmacy.geojson")) == "pharmacy"


def test_unknown_healthdirect_layer_is_rejected():
    with pytest.raises(ValueError):
        category_from_filename(Path("specialists.geojson"))
