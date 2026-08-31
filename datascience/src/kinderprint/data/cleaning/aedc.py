"""
AEDC SA2 cleaner -- raw workbook to normalised long-format tables.

Design decisions (see reports/DS03_aedc_profile.md and docs/decisions/):
  D1  Analysis unit is the AEDC REPORTING AREA, not the SA2. AEDC merges some
      SA2s to meet its minimum child count; 13 such groups fall in Greater
      Melbourne. A bridge table maps each reporting area to its component SA2s
      so geometry can be dissolved on join.
  D2  Suppression is preserved as a three-state quality flag. Suppressed values
      are NEVER imputed and NEVER coerced to zero or null-as-number.
  D3  Headers are read from the workbook rather than hardcoded, because the
      summary sheets carry a different measure label from the domain sheets.
"""

from __future__ import annotations
import re
from pathlib import Path
import pandas as pd

SHEETS = {
    "SA2 Health":              ("domain",    "Physical health and wellbeing"),
    "SA2 Social":              ("domain",    "Social competence"),
    "SA2 Emotional":           ("domain",    "Emotional maturity"),
    "SA2 Language":            ("domain",    "Language and cognitive skills"),
    "SA2 Communication":       ("domain",    "Communication skills and general knowledge"),
    "SA2 One or more":         ("summary",   "Vulnerable on one or more domains"),
    "SA2 Two or more":         ("summary",   "Vulnerable on two or more domains"),
    "SA2 On track five":       ("summary",   "On track on all five domains"),
    "SA2 Health 1 Subdomain":  ("subdomain", "Physical health -- subdomain 1"),
    "SA2 Health 2 Subdomain":  ("subdomain", "Physical health -- subdomain 2"),
    "SA2 Health 3 Subdomain":  ("subdomain", "Physical health -- subdomain 3"),
}

SUPPRESSION = {"#": "SUPPRESSED_LE3", "*": "SUPPRESSED_RULE"}
BOUNDED = re.compile(r"^[≤≥<>]\s*\d+$")
SA2_ROW = re.compile(r"^\d{9}")
SA2_CODE = re.compile(r"\d{9}")


def _slug(text: str) -> str:
    t = str(text).lower()
    if "on track" in t:      return "on_track"
    if "at risk" in t:       return "at_risk"
    if "vulnerable" in t:    return "vulnerable"
    if "valid scores" in t:  return "n_children"
    return re.sub(r"[^a-z0-9]+", "_", t).strip("_")


def _classify(raw):
    """Return (value, quality_flag). Never invents a number."""
    if pd.isna(raw):
        return None, "MISSING"
    s = str(raw).strip()
    if s in SUPPRESSION:
        return None, SUPPRESSION[s]
    if BOUNDED.match(s):
        return None, "BOUNDED"
    try:
        return float(s), "VALUE"
    except ValueError:
        return None, "UNPARSED"


def _read_sheet(path: Path, sheet: str) -> pd.DataFrame:
    head = pd.read_excel(path, sheet_name=sheet, header=None, nrows=6)
    measure = head.iloc[4].ffill()
    year = head.iloc[5]

    body = pd.read_excel(path, sheet_name=sheet, header=None, skiprows=6).dropna(how="all")
    code = body[1].astype(str).str.strip()
    body = body[code.str.match(SA2_ROW)].copy()
    body["area_code"] = code[body.index]
    body["area_name"] = body[2].astype(str).str.strip()

    # Measure blocks alternate n then % for every year except the count block.
    out = []
    for col in range(3, body.shape[1] - 2):
        m, y = measure.get(col), year.get(col)
        if pd.isna(m):
            continue
        metric = _slug(m)
        if metric == "n_children":
            ref_year, unit = int(float(y)), "count"
        else:
            prev_year = year.get(col - 1)
            if pd.notna(y):
                ref_year, unit, metric = int(float(y)), "count", f"{metric}_n"
            elif pd.notna(prev_year):
                ref_year, unit, metric = int(float(prev_year)), "percent", f"{metric}_pct"
            else:
                continue
        for idx in body.index:
            val, flag = _classify(body.at[idx, col])
            out.append((body.at[idx, "area_code"], body.at[idx, "area_name"],
                        ref_year, metric, val, unit, flag))

    return pd.DataFrame(out, columns=[
        "area_code", "area_name", "reference_year", "indicator", "value", "unit", "quality_flag"])


def clean(raw_path: Path, lookup_path: Path, gccsa: str = "Greater Melbourne"):
    lk = pd.read_csv(lookup_path, dtype=str)
    keep = set(lk.loc[lk.GCCSA_NAME_2021 == gccsa, "SA2_CODE_2021"])

    frames = []
    for sheet, (kind, domain) in SHEETS.items():
        df = _read_sheet(raw_path, sheet)
        df["domain"] = domain
        df["domain_type"] = kind
        frames.append(df)
    long = pd.concat(frames, ignore_index=True)

    # Restrict to reporting areas whose components are all in scope.
    comps = long["area_code"].drop_duplicates().to_frame()
    comps["components"] = comps["area_code"].apply(lambda s: SA2_CODE.findall(s))
    comps["in_scope"] = comps["components"].apply(lambda cs: all(c in keep for c in cs))
    in_scope = set(comps.loc[comps.in_scope, "area_code"])
    long = long[long["area_code"].isin(in_scope)].copy()

    # communities + bridge
    areas = comps[comps.in_scope].copy().reset_index(drop=True)
    areas["community_id"] = ["MEL{:04d}".format(i + 1) for i in range(len(areas))]
    names = long.groupby("area_code")["area_name"].first()
    areas["community_name"] = areas["area_code"].map(names)
    areas["n_component_sa2"] = areas["components"].str.len()
    areas["is_merged"] = areas["n_component_sa2"] > 1

    required = ["SA2_CODE_2021", "SA2_NAME_2021", "SA3_CODE_2021", "SA3_NAME_2021",
                "SA4_CODE_2021", "SA4_NAME_2021", "GCCSA_NAME_2021", "STATE_NAME_2021"]
    optional = [c for c in ["AREA_ALBERS_SQKM"] if c in lk.columns]

    bridge = areas.explode("components").rename(columns={"components": "sa2_code_2021"})
    bridge = bridge.merge(lk[required + optional],
                          left_on="sa2_code_2021", right_on="SA2_CODE_2021", how="left")

    spec = dict(
        sa3_name=("SA3_NAME_2021", "first"),
        sa4_name=("SA4_NAME_2021", "first"),
        gccsa_name=("GCCSA_NAME_2021", "first"),
        state_name=("STATE_NAME_2021", "first"),
    )
    if optional:
        spec["area_sqkm"] = ("AREA_ALBERS_SQKM", lambda s: round(pd.to_numeric(s).sum(), 4))
    agg = bridge.groupby("community_id").agg(**spec).reset_index()
    if not optional:
        agg["area_sqkm"] = pd.NA

    communities = areas.merge(agg, on="community_id")[[
        "community_id", "area_code", "community_name", "n_component_sa2", "is_merged",
        "sa3_name", "sa4_name", "gccsa_name", "state_name", "area_sqkm"]]
    communities = communities.rename(columns={"area_code": "aedc_area_code"})

    child_dev = long.merge(
        areas[["area_code", "community_id"]], on="area_code", how="left")[[
        "community_id", "reference_year", "domain", "domain_type",
        "indicator", "value", "unit", "quality_flag"]]
    child_dev.insert(0, "child_dev_id", range(1, len(child_dev) + 1))
    child_dev["source_id"] = "aedc_sa2_2009_2024"

    community_sa2 = bridge[["community_id", "sa2_code_2021", "SA2_NAME_2021"]].rename(
        columns={"SA2_NAME_2021": "sa2_name_2021"}).reset_index(drop=True)

    return communities, community_sa2, child_dev
