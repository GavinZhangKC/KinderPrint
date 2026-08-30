"""
SEIFA 2021 + Census 2021 cleaner -> community-level socioeconomic table.

Design decisions:
  D4  Community-level values for MERGED AEDC reporting areas are aggregated
      from their component SA2s. Counts are summed. Medians and averages are
      POPULATION-WEIGHTED, which is an approximation: a weighted mean of medians
      is not a true median. Affects 13 of 346 communities; flagged, not hidden.
  D5  IRSD is derived from Census income, education and employment. IRSD and the
      raw Census equivalents are therefore never used in the same distance
      metric or composite. Enforced by the feature register, not by convention.
  D6  SEIFA-excluded SA2s (ABS Table 6) are recorded as EXCLUDED_BY_PUBLISHER,
      never imputed.
"""

from __future__ import annotations
from pathlib import Path
import pandas as pd

SEIFA_IRSD_SHEET = "Table 2"
SEIFA_EXCLUDED_SHEET = "Table 6"

IRSD_COLS = ["sa2_code", "sa2_name", "urp", "irsd_score", "_a", "irsd_rank_aus",
             "irsd_decile_aus", "irsd_pct_aus", "_b", "state", "irsd_rank_st",
             "irsd_decile_st", "irsd_pct_st", "irsd_min_sa1", "irsd_max_sa1",
             "pct_urp_no_score"]

# Census: table -> {output_name: source_column}. Denominators kept explicit.
CENSUS_SPEC = {
    "G01": {"population": "Tot_P_P", "children_0_4": "Age_0_4_yr_P"},
    "G02": {"median_age": "Median_age_persons",
            "median_hh_income_weekly": "Median_tot_hhd_inc_weekly",
            "median_rent_weekly": "Median_rent_weekly",
            "avg_household_size": "Average_household_size",
            "persons_per_bedroom": "Average_num_psns_per_bedroom"},
    "G32": {"one_parent_families": "Tot_One_parent_fam", "total_families": "Tot_Tot"},
    "G46B": {"unemployed": "P_Tot_Unemp_Tot", "labour_force": "P_Tot_LF_Tot"},
    "G49B": {"no_qualification": "P_Lev_Edu_NS_Total", "qual_base": "P_Tot_Total"},
}

COUNTS = {"population", "children_0_4", "one_parent_families", "total_families",
          "unemployed", "labour_force", "no_qualification", "qual_base"}
WEIGHTED = {"median_age", "median_hh_income_weekly", "median_rent_weekly",
            "avg_household_size", "persons_per_bedroom", "irsd_score",
            "irsd_min_sa1", "irsd_max_sa1"}


def load_seifa(path: Path) -> tuple[pd.DataFrame, set[str]]:
    irsd = pd.read_excel(path, sheet_name=SEIFA_IRSD_SHEET, header=None,
                         skiprows=6, names=IRSD_COLS)
    irsd["sa2_code"] = irsd["sa2_code"].astype(str).str.strip()
    irsd = irsd[irsd.sa2_code.str.match(r"^\d{9}$")].drop(columns=["_a", "_b"])
    for c in ["urp", "irsd_score", "irsd_decile_aus", "irsd_pct_aus",
              "irsd_min_sa1", "irsd_max_sa1"]:
        irsd[c] = pd.to_numeric(irsd[c], errors="coerce")

    exc = pd.read_excel(path, sheet_name=SEIFA_EXCLUDED_SHEET, header=None, skiprows=6,
                        names=["sa2_code", "sa2_name", "urp", "IRSD", "IRSAD", "IER", "IEO"])
    exc["sa2_code"] = exc["sa2_code"].astype(str).str.strip()
    excluded = set(exc.loc[exc.sa2_code.str.match(r"^\d{9}$") & (exc.IRSD == "Y"), "sa2_code"])
    return irsd, excluded


def load_census(census_dir: Path) -> pd.DataFrame:
    out = None
    for table, spec in CENSUS_SPEC.items():
        f = census_dir / f"2021Census_{table}_VIC_SA2.csv"
        df = pd.read_csv(f, usecols=["SA2_CODE_2021"] + list(spec.values()))
        df = df.rename(columns={v: k for k, v in spec.items()})
        df["SA2_CODE_2021"] = df["SA2_CODE_2021"].astype(str).str.strip()
        out = df if out is None else out.merge(df, on="SA2_CODE_2021", how="outer")
    return out.rename(columns={"SA2_CODE_2021": "sa2_code"})


def build(seifa_path: Path, census_dir: Path, bridge: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    irsd, excluded = load_seifa(seifa_path)
    census = load_census(census_dir)

    sa2 = bridge[["community_id", "sa2_code_2021"]].rename(columns={"sa2_code_2021": "sa2_code"})
    sa2["sa2_code"] = sa2["sa2_code"].astype(str)
    sa2 = sa2.merge(irsd, on="sa2_code", how="left").merge(census, on="sa2_code", how="left")

    # Weight by Census population where available, falling back to SEIFA URP.
    sa2["w"] = sa2["population"].fillna(sa2["urp"]).fillna(0)

    rows = []
    for cid, grp in sa2.groupby("community_id"):
        rec = {"community_id": cid}
        for col in COUNTS:
            rec[col] = grp[col].sum(min_count=1)
        w = grp["w"]
        for col in WEIGHTED:
            vals = pd.to_numeric(grp[col], errors="coerce")
            mask = vals.notna() & (w > 0)
            rec[col] = round((vals[mask] * w[mask]).sum() / w[mask].sum(), 4) if mask.any() and w[mask].sum() > 0 else None
        # Decile from the largest component; a weighted mean of deciles is meaningless.
        top = grp.loc[w.idxmax()] if len(grp) and w.max() > 0 else grp.iloc[0]
        rec["irsd_decile_aus"] = None if pd.isna(top["irsd_decile_aus"]) else int(top["irsd_decile_aus"])
        rec["irsd_pct_aus"] = None if pd.isna(top["irsd_pct_aus"]) else int(top["irsd_pct_aus"])
        rec["n_component_sa2"] = len(grp)
        rec["n_sa2_excluded_by_seifa"] = int(grp["sa2_code"].isin(excluded).sum())
        rec["aggregation_method"] = "single" if len(grp) == 1 else "population_weighted"
        rows.append(rec)

    df = pd.DataFrame(rows)

    # Derived rates. Guard every denominator.
    def rate(num, den, scale=100):
        n, d = df[num], df[den]
        return ((n / d) * scale).where(d > 0).round(2)

    df["children_0_4_pct"] = rate("children_0_4", "population")
    df["one_parent_family_pct"] = rate("one_parent_families", "total_families")
    df["unemployment_rate"] = rate("unemployed", "labour_force")
    df["no_qualification_pct"] = rate("no_qualification", "qual_base")
    df["irsd_sa1_spread"] = (df["irsd_max_sa1"] - df["irsd_min_sa1"]).round(2)

    # Long format for the database / API, mirroring child_development.
    keep = ["population", "children_0_4_pct", "median_age", "median_hh_income_weekly",
            "median_rent_weekly", "avg_household_size", "persons_per_bedroom",
            "one_parent_family_pct", "unemployment_rate", "no_qualification_pct",
            "irsd_score", "irsd_decile_aus", "irsd_pct_aus", "irsd_sa1_spread"]
    UNITS = {"population": "count", "children_0_4_pct": "percent", "median_age": "years",
             "median_hh_income_weekly": "AUD per week", "median_rent_weekly": "AUD per week",
             "avg_household_size": "persons", "persons_per_bedroom": "persons",
             "one_parent_family_pct": "percent", "unemployment_rate": "percent",
             "no_qualification_pct": "percent", "irsd_score": "index",
             "irsd_decile_aus": "decile", "irsd_pct_aus": "percentile", "irsd_sa1_spread": "index"}
    SRC = {c: ("seifa_2021_sa2" if c.startswith("irsd") else "census_2021_gcp_sa2") for c in keep}

    long = []
    for _, r in df.iterrows():
        for col in keep:
            v = r[col]
            flag = "VALUE" if pd.notna(v) else (
                "EXCLUDED_BY_PUBLISHER" if col.startswith("irsd") and r["n_sa2_excluded_by_seifa"] else "MISSING")
            long.append({"community_id": r["community_id"], "reference_year": 2021,
                         "indicator": col, "value": None if pd.isna(v) else float(v),
                         "unit": UNITS[col], "quality_flag": flag, "source_id": SRC[col]})
    long = pd.DataFrame(long)
    long.insert(0, "socio_id", range(1, len(long) + 1))
    return df, long
