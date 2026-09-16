import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from clean_phidu_child_youth import _number


def test_phidu_suppression_is_never_coerced_to_zero():
    assert _number("#") == (None, "suppressed")
    assert _number("..") == (None, "suppressed")
    assert _number(0) == (0.0, "available")


def test_phidu_unexpected_text_is_flagged():
    assert _number("unexpected") == (None, "unparsed")
