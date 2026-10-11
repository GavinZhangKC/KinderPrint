"""Your area in 2031: projected children and service pressure."""
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "processed" / "future_demand_sa2.csv"
ACCESS = ROOT / "data" / "processed" / "access_e2sfca_sa2.csv"


@pytest.fixture(scope="module")
def table():
    if not OUT.exists():
        pytest.skip("not built")
    return pd.read_csv(OUT, dtype={"sa2_code": str})


def test_every_sa2_has_every_year(table):
    years = table.groupby("sa2_code").projection_year.apply(lambda s: tuple(sorted(s)))
    assert (years == (2021, 2026, 2031, 2036)).all()
    assert table.sa2_code.nunique() == 361
    assert not table.duplicated(["sa2_code", "projection_year"]).any()


def test_2026_reproduces_the_published_access_measure(table):
    published = pd.read_csv(ACCESS, dtype={"sa2_code": str}).pivot(index="sa2_code", columns="service", values="access_5km")
    base = table[table.projection_year == 2026].set_index("sa2_code")
    assert (base.ecec_places_per_100_0_4 - published.ecec.round(1)).abs().max() <= 0.05
    assert (base.gp_practices_per_10000 - published.gp.round(2)).abs().max() <= 0.005


def test_places_to_keep_access_only_for_future_years_and_never_negative(table):
    past = table[table.projection_year <= 2026]
    assert past.ecec_places_to_keep_2026_access.isna().all()
    future = table[table.projection_year > 2026]
    assert (future.ecec_places_to_keep_2026_access.dropna() >= 0).all()


def test_more_children_with_fixed_places_never_raises_local_access(table):
    # Holding services fixed, an area whose children grow and whose neighbours also grow cannot gain access
    # unless neighbours shrink; check the Melbourne-wide median falls as children rise.
    med = table.groupby("projection_year").ecec_places_per_100_0_4.median()
    kids = table.groupby("projection_year").children_0_4.sum()
    assert kids[2031] > kids[2026] and med[2031] < med[2026]
