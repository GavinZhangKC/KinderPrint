"""Data-quality tests. These run in CI and gate every pipeline run."""
import json, re
from pathlib import Path
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data/processed"
REF = ROOT / "data/reference"


@pytest.fixture(scope="module")
def comm(): return pd.read_csv(PROC / "communities.csv")

@pytest.fixture(scope="module")
def bridge(): return pd.read_csv(PROC / "community_sa2.csv", dtype={"sa2_code_2021": str})

@pytest.fixture(scope="module")
def child(): return pd.read_csv(PROC / "child_development.csv")

@pytest.fixture(scope="module")
def socio(): return pd.read_csv(PROC / "socioeconomic.csv")

@pytest.fixture(scope="module")
def asgs(): return pd.read_csv(REF / "sa2_ed3_lookup.csv", dtype=str)


# ---------- schema and uniqueness ----------
def test_communities_primary_key_unique(comm):
    assert comm.community_id.is_unique

def test_child_development_primary_key_unique(child):
    assert child.child_dev_id.is_unique

def test_no_duplicate_indicator_rows(child):
    key = ["community_id", "reference_year", "domain", "indicator"]
    assert not child.duplicated(subset=key).any()

def test_expected_columns_present(child):
    required = {"community_id", "reference_year", "domain", "indicator",
                "value", "unit", "quality_flag", "source_id"}
    assert required.issubset(child.columns)


# ---------- referential integrity ----------
def test_all_child_dev_foreign_keys_resolve(child, comm):
    assert set(child.community_id) <= set(comm.community_id)

def test_all_socio_foreign_keys_resolve(socio, comm):
    assert set(socio.community_id) <= set(comm.community_id)

def test_bridge_covers_every_community(bridge, comm):
    assert set(bridge.community_id) == set(comm.community_id)


# ---------- geographic validity (harmonisation) ----------
def test_every_sa2_code_is_valid_asgs_edition_3(bridge, asgs):
    assert set(bridge.sa2_code_2021) <= set(asgs.SA2_CODE_2021)

def test_all_greater_melbourne_sa2s_covered_exactly_once(bridge, asgs):
    mel = set(asgs.loc[asgs.GCCSA_NAME_2021 == "Greater Melbourne", "SA2_CODE_2021"])
    assert set(bridge.sa2_code_2021) == mel
    assert not bridge.sa2_code_2021.duplicated().any()

def test_sa2_codes_are_nine_digits(bridge):
    assert bridge.sa2_code_2021.astype(str).str.fullmatch(r"\d{9}").all()

def test_component_count_matches_bridge(comm, bridge):
    counted = bridge.groupby("community_id").size()
    expected = comm.set_index("community_id").n_component_sa2
    assert (counted.sort_index() == expected.sort_index()).all()


# ---------- value validity ----------
def test_percentages_within_zero_and_one_hundred(child, socio):
    for df in (child, socio):
        pct = df[(df.unit == "percent") & df.value.notna()]
        assert pct.value.between(0, 100).all()

def test_counts_are_non_negative(child):
    counts = child[(child.unit == "count") & child.value.notna()]
    assert (counts.value >= 0).all()

def test_numerator_never_exceeds_denominator(child):
    w = child.pivot_table(index=["community_id", "reference_year", "domain"],
                          columns="indicator", values="value", aggfunc="first")
    for col in ("vulnerable_n", "on_track_n", "at_risk_n"):
        if col in w.columns and "n_children" in w.columns:
            both = w[[col, "n_children"]].dropna()
            assert (both[col] <= both.n_children).all(), col


# ---------- suppression: the rule that must never break ----------
def test_suppressed_values_are_never_populated(child):
    suppressed = child[child.quality_flag.str.startswith("SUPPRESSED")]
    assert suppressed.value.isna().all()

def test_available_values_are_never_null(child):
    assert child.loc[child.quality_flag == "VALUE", "value"].notna().all()

def test_no_unparsed_cells_survived_cleaning(child):
    assert "UNPARSED" not in set(child.quality_flag)

def test_zero_imputed_values(child, socio):
    """No imputation anywhere. Every value traces to a source cell."""
    for df in (child, socio):
        assert "IMPUTED" not in set(df.quality_flag)


# ---------- temporal ----------
def test_all_six_aedc_cycles_present(child):
    assert sorted(child.reference_year.unique()) == [2009, 2012, 2015, 2018, 2021, 2024]

def test_socioeconomic_reference_year_is_2021(socio):
    assert set(socio.reference_year) == {2021}


# ---------- environment layer ----------
@pytest.fixture(scope="module")
def env(): return pd.read_csv(PROC / "environmental.csv")


def test_environment_covers_all_communities(env, comm):
    assert set(env.community_id) == set(comm.community_id)

def test_environment_percentages_valid(env):
    for c in ["peranyveg", "vegetation_pct", "peranytree", "pergrass", "open_space_pct"]:
        if c in env.columns:
            v = env[c].dropna()
            assert v.between(0, 100).all(), c

def test_urban_heat_within_plausible_range(env):
    col = "uhi_degc" if "uhi_degc" in env.columns else "uhi18_m"
    v = env[col].dropna()
    assert v.between(-15, 25).all(), "UHI is degrees above a non-urban baseline"

def test_low_coverage_communities_are_flagged(env):
    """Where the source mapping does not reach, values must not be presented as clean."""
    low = env[env.env_coverage_pct < 50]
    assert (low.env_quality_flag.isin(["PARTIAL_COVERAGE", "UNAVAILABLE"])).all()

def test_environment_values_suppressed_where_coverage_inadequate():
    d = pd.read_csv(PROC / "final_table.csv")
    bad = d[d.env_quality_flag.isin(["PARTIAL_COVERAGE", "UNAVAILABLE"])]
    for c in ["vegetation_pct", "uhi_degc", "open_space_pct"]:
        if c in d.columns:
            assert bad[c].isna().all(), c
