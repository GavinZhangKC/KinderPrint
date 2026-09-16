import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from process_epa_air_quality import canonical_pollutant


def test_particle_method_aliases_are_standardised():
    assert canonical_pollutant("BPM2.5") == "PM2.5"
    assert canonical_pollutant("SBPM25") == "PM2.5"
    assert canonical_pollutant("PM10") == "PM10"


def test_target_gases_are_preserved():
    assert canonical_pollutant("no2") == "NO2"
    assert canonical_pollutant("O3") == "O3"
