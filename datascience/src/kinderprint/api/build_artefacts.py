"""
Build the approved JSON artefacts the KinderPrint backend reads.

The backend validates strictly and rejects a whole file on one bad record, so
this module targets validation.py exactly:
  - every profile carries all three domains (Child Development, Social, Environment)
  - value is non-null iff status == "available"
  - priority is a BAND string, never a score
  - match_strength is a string
  - explanation status equals the aggregate of its factor statuses
  - neighbourhood ids are URL-safe (no slashes)
"""

from __future__ import annotations
import json
from pathlib import Path
import pandas as pd
import numpy as np

from kinderprint.analytics.suitability import build_criterion_scores

DOMAINS = ["Child Development", "Social", "Environment"]
GEO_UNIT = "SA2 (ASGS Edition 3, 2021)"

NOTICES = {
    "area_level_information":
        "KinderPrint describes communities, not individual children. Every figure is an "
        "area-level statistic and cannot be applied to any person living there.",
    "association_not_causation":
        "These are observed associations in area-level data. They do not show that any "
        "condition caused any child-development outcome.",
    "investigation_leads":
        "Results are starting points for investigation, not conclusions. They indicate where "
        "a closer look may be warranted.",
    "comparable_not_identical":
        "Matched communities are similar on the socioeconomic and demographic measures used "
        "for matching. They are not identical, and unmeasured differences remain.",
    "area_level_comparison":
        "Differences between communities are subject to sampling uncertainty. Where a difference "
        "is not statistically significant this is stated explicitly.",
}

PROFILE_INDICATORS = {
    "Child Development": [
        ("aedc_vulnerable_one_or_more", "Developmentally vulnerable on one or more domains", "vulnerable_pct", "percent"),
        ("aedc_vulnerable_two_or_more", "Developmentally vulnerable on two or more domains", "vuln2_pct", "percent"),
        ("aedc_on_track_five", "On track on all five domains", "ontrack5_pct", "percent"),
        ("aedc_children_assessed", "Children with valid AEDC scores", "n_children", "count"),
        ("aedc_physical_on_track", "On track in physical health and wellbeing", "physical_on_track_pct", "percent"),
        ("aedc_social_on_track", "On track in social competence", "social_on_track_pct", "percent"),
        ("aedc_emotional_on_track", "On track in emotional maturity", "emotional_on_track_pct", "percent"),
        ("aedc_language_on_track", "On track in language and cognitive skills", "language_on_track_pct", "percent"),
        ("aedc_communication_on_track", "On track in communication skills and general knowledge", "communication_on_track_pct", "percent"),
    ],
    "Social": [
        ("seifa_irsd_score", "SEIFA IRSD score", "irsd_score", "index"),
        ("seifa_irsd_decile", "SEIFA IRSD decile (national)", "irsd_decile_aus", "decile"),
        ("census_population", "Usual resident population", "population", "count"),
        ("census_children_0_4_pct", "Children aged 0-4", "children_0_4_pct", "percent"),
        ("census_median_hh_income", "Median household income", "median_hh_income_weekly", "AUD per week"),
        ("census_unemployment_rate", "Unemployment rate", "unemployment_rate", "percent"),
        ("census_one_parent_family_pct", "One-parent families", "one_parent_family_pct", "percent"),
    ],
    "Environment": [
        ("env_vegetation_cover", "Tree canopy cover", "vegetation_pct", "percent"),
        ("env_urban_heat", "Urban heat island effect", "uhi_degc", "degrees Celsius"),
        ("env_open_space_access", "Public open space", "open_space_pct", "percent"),
    ],
}

SOURCES = {"aedc": "AEDC 2024", "seifa": "ABS SEIFA 2021", "census": "ABS Census 2021",
           "env": "DELWP Cooling & Greening Melbourne 2018 / VPA Open Space"}
YEARS = {"aedc": "2024", "seifa": "2021", "census": "2021", "env": "2018"}


def _num(v):
    if v is None or (isinstance(v, float) and np.isnan(v)) or pd.isna(v):
        return None
    return round(float(v), 4)


def _indicator(ind_id, name, value, unit, prefix):
    # NaN is not None, so availability must be judged AFTER normalisation.
    clean = _num(value)
    available = clean is not None
    return {
        "id": ind_id,
        "name": name,
        "value": clean,
        "unit": unit,
        "status": "available" if available else "unavailable",
        "source": SOURCES[prefix],
        "geographic_unit": GEO_UNIT,
        "reference_year": YEARS[prefix],
    }


def build_profiles(d: pd.DataFrame) -> dict:
    profiles = []
    for _, r in d.iterrows():
        domains = []
        for dom in DOMAINS:
            inds = []
            for ind_id, name, col, unit in PROFILE_INDICATORS[dom]:
                prefix = ind_id.split("_")[0]
                prefix = {"aedc": "aedc", "seifa": "seifa", "census": "census", "env": "env"}[prefix]
                val = r[col] if col in d.columns else None
                inds.append(_indicator(ind_id, name, val, unit, prefix))
            domains.append({"id": dom.lower().replace(" ", "-"), "name": dom, "indicators": inds})
        profiles.append({
            "neighbourhood": {"id": r.neighbourhood_id, "name": r.community_name,
                              "geographic_unit": GEO_UNIT},
            "domains": domains,
            "metadata": {"data_quality":
                         f"{int(r.n_component_sa2)} SA2(s); AEDC {r.aedc_flag}; "
                         f"{int(r.n_children) if pd.notna(r.n_children) else 0} children assessed"},
            "limitations": [],
        })
    return {"profiles": profiles}


def build_suitability(
    profiles: list[dict], supplemental_scores: pd.DataFrame | None = None
) -> dict:
    """Build the provisional locality-suitability output outside the backend."""
    localities = build_criterion_scores(profiles)
    if supplemental_scores is not None:
        score_columns = {
            "general_practice_access": "general_practice_access_score",
            "hospital_access": "hospital_access_score",
            "pharmacy_access": "pharmacy_access_score",
        }
        by_id = supplemental_scores.assign(
            neighbourhood_id=supplemental_scores.neighbourhood_id.astype(str)
        ).set_index("neighbourhood_id")
        for locality in localities:
            if locality["id"] not in by_id.index:
                continue
            row = by_id.loc[locality["id"]]
            for criterion, column in score_columns.items():
                locality["scores"][criterion] = _num(row[column])
    return {
        "localities": localities,
        "metadata": {
            "source": "Approved profile dataset",
            "reference_year": "2024",
            "geographic_unit": GEO_UNIT,
            "data_quality": (
                "AEDC, environment, socioeconomic and HealthDirect facility-availability "
                "measures. Facility scores are population-adjusted Greater Melbourne percentiles."
            ),
        },
    }


def build_priorities(d: pd.DataFrame) -> dict:
    results = []
    for _, r in d.iterrows():
        if pd.isna(r.v1_band) or r.aedc_flag != "VALUE":
            results.append({
                "label": "Priority for Investigation",
                "neighbourhood": {"id": r.neighbourhood_id, "name": r.community_name},
                "priority_band": None, "contributing_domains": [], "status": "unavailable",
                "limitations": [{"code": "priority_inputs_unavailable",
                                 "message": "Child-development data is suppressed or unavailable for this community, so no investigation priority has been produced.",
                                 "affected_fields": ["priority_band"]}],
            })
            continue
        contributing = ["Child Development"]
        if pd.notna(r.irsd_decile_aus) and r.irsd_decile_aus <= 4:
            contributing.append("Social")
        results.append({
            "label": "Priority for Investigation",
            "neighbourhood": {"id": r.neighbourhood_id, "name": r.community_name},
            "priority_band": str(r.v1_band),
            "contributing_domains": contributing,
            "status": "available",
        })
    return {
        "approved": True,
        "results": results,
        "metadata": {
            "source": "KinderPrint priority model V1 (weighted residual)",
            "reference_year": "2024",
            "geographic_unit": GEO_UNIT,
            "data_quality": "Band derived from AEDC vulnerability relative to socioeconomic position, weighted by children assessed. Higher band pre-registered at z>=1.28.",
        },
    }


def build_explanations(d: pd.DataFrame) -> dict:
    FACTORS = {
        "Child Development": [("aedc_vulnerable_one_or_more", "Developmentally vulnerable on one or more domains", "vulnerable_pct", "aedc")],
        "Social": [("seifa_irsd_score", "SEIFA IRSD score", "irsd_score", "seifa"),
                   ("census_children_0_4_pct", "Children aged 0-4", "children_0_4_pct", "census"),
                   ("seifa_irsd_sa1_spread", "Within-community SEIFA spread", "irsd_sa1_spread", "seifa")],
        "Environment": [("env_vegetation_cover", "Urban vegetation cover", "vegetation_pct", "env"),
                        ("env_urban_heat", "Urban heat island effect", "uhi_degc", "env")],
    }
    out = []
    for _, r in d.iterrows():
        factor_domains, incomplete, statuses, highlighted = [], [], [], []
        for dom in DOMAINS:
            fs = []
            for fid, name, col, prefix in FACTORS[dom]:
                val = r[col] if col in d.columns else None
                f = _indicator(fid, name, val, "", prefix)
                f.pop("unit")
                fs.append(f)
                statuses.append(f["status"])
                if f["status"] != "available":
                    incomplete.append({"indicator": fid,
                                       "reason": "This input is not yet available for Iteration 1."})
                elif dom == "Child Development":
                    highlighted.append(fid)
            factor_domains.append({"domain": dom, "factors": fs})
        agg = statuses[0] if len(set(statuses)) == 1 else "limited"
        rec = {
            "neighbourhood": {"id": r.neighbourhood_id, "name": r.community_name},
            "factor_domains": factor_domains,
            "highlighted_factor_ids": highlighted,
            "incomplete_inputs": incomplete,
            "status": agg,
        }
        if agg != "available":
            rec["limitations"] = [{"code": "explanation_inputs_incomplete",
                                   "message": "Some contributing inputs are unavailable. The explanation covers only the inputs that are present.",
                                   "affected_fields": [i["indicator"] for i in incomplete]}]
        out.append(rec)
    return {
        "approved": True,
        "explanations": out,
        "metadata": {"source": "KinderPrint explanation module V1", "reference_year": "2024",
                     "geographic_unit": GEO_UNIT,
                     "data_quality": "Factor contributions derived from the V1 residual model. Association only; not causal."},
    }


def build_comparisons(d: pd.DataFrame) -> dict:
    idx = d.reset_index(drop=True)
    SIDE = [("aedc_vulnerable_one_or_more", "Developmentally vulnerable on one or more domains", "vulnerable_pct"),
            ("seifa_irsd_score", "SEIFA IRSD score", "irsd_score"),
            ("census_median_hh_income", "Median household income", "median_hh_income_weekly"),
            ("census_unemployment_rate", "Unemployment rate", "unemployment_rate"),
            ("env_vegetation_cover", "Urban vegetation cover", "vegetation_pct"),
            ("env_urban_heat", "Urban heat island effect", "uhi_degc")]
    BASIS = ["SEIFA IRSD score", "Median household income", "Unemployment rate",
             "One-parent families", "Children aged 0-4", "Median age", "Average household size"]
    matches, comparisons = [], []
    for _, r in idx.iterrows():
        src = {"id": r.neighbourhood_id, "name": r.community_name, "geographic_unit": GEO_UNIT}
        if r.match_idx is None or pd.isna(r.match_idx) or int(r.match_idx) < 0:
            matches.append({"source_neighbourhood": src, "matched_neighbourhood": None,
                            "match_strength": None, "similarity_basis": [], "status": "no_match",
                            "limitations": [{"code": "no_comparable_community",
                                             "message": "No community within the same region is similar enough on the matching measures to support a fair comparison.",
                                             "affected_fields": ["matched_neighbourhood"]}]})
            continue
        p = idx.loc[int(r.match_idx)]
        tgt = {"id": p.neighbourhood_id, "name": p.community_name, "geographic_unit": GEO_UNIT}
        matches.append({"source_neighbourhood": src, "matched_neighbourhood": tgt,
                        "match_strength": str(r.match_strength), "similarity_basis": BASIS,
                        "status": "available"})
        fields, any_missing = [], False
        for fid, name, col in SIDE:
            a = _num(r[col]) if col in idx.columns else None
            b = _num(p[col]) if col in idx.columns else None
            if a is None or b is None:
                any_missing = True
            fields.append({"id": fid, "name": name,
                           "source_value": a, "comparison_value": b,
                           "source_status": "available" if a is not None else "unavailable",
                           "comparison_status": "available" if b is not None else "unavailable"})
        lims = []
        if pd.notna(r.get("sig")):
            if not r.sig:
                lims.append({"code": "difference_not_significant",
                             "message": "The difference in child-development outcomes between these communities is within the range expected from sampling variation and should not be treated as a real difference.",
                             "affected_fields": ["aedc_vulnerable_one_or_more"]})
        if any_missing:
            lims.append({"code": "comparison_inputs_incomplete",
                         "message": "One or more environmental measures are unavailable for these communities, usually because the source mapping does not fully cover the area.",
                         "affected_fields": ["env_vegetation_cover", "env_urban_heat"]})
        comparisons.append({"source_neighbourhood": src, "comparison_neighbourhood": tgt,
                            "side_by_side": fields, "similarity_basis": BASIS,
                            "match_strength": str(r.match_strength),
                            "status": "limited" if lims else "available",
                            "limitations": lims})
    return {"approved": True, "matches": matches, "comparisons": comparisons,
            "metadata": {"source": "KinderPrint matching model M3 (stratified Mahalanobis with caliper)",
                         "reference_year": "2024", "geographic_unit": GEO_UNIT,
                         "data_quality": "Matched within SA4 on socioeconomic and demographic measures only. Environmental measures deliberately excluded from matching to avoid removing the differences under investigation."}}


def build_boundaries(geo: dict, d: pd.DataFrame) -> dict:
    lookup = {}
    for _, r in d.iterrows():
        for code in str(r.aedc_area_code).split("/"):
            lookup[code] = (r.neighbourhood_id, r.community_name)
    groups = {}
    for f in geo["features"]:
        code = f["properties"]["SA2_CODE_2021"]
        if code not in lookup:
            continue
        nid, name = lookup[code]
        groups.setdefault(nid, {"name": name, "polys": []})
        g = f["geometry"]
        groups[nid]["polys"].extend(g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]])
    features = [{"type": "Feature",
                 "properties": {"id": nid, "name": v["name"], "geographic_unit": GEO_UNIT,
                                "source": "ABS ASGS Edition 3 (2021)",
                                "boundary_version": "ASGS Edition 3 (July 2021 - June 2026)"},
                 "geometry": {"type": "MultiPolygon", "coordinates": v["polys"]}}
                for nid, v in groups.items()]
    return {"type": "FeatureCollection", "features": features}
