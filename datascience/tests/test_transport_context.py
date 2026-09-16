import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from integrate_transport_context import _higher_score, _lower_score


def test_traffic_score_rewards_lower_values():
    scores = _lower_score(pd.Series([10, 50, 100]))
    assert scores.iloc[0] > scores.iloc[2]


def test_transport_score_rewards_higher_values_and_preserves_missing():
    scores = _higher_score(pd.Series([1, 5, None]))
    assert scores.iloc[1] > scores.iloc[0]
    assert pd.isna(scores.iloc[2])
