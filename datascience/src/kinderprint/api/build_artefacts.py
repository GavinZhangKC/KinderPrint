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
        "VKinder describes neighborhoods, not individual children. Every figure is an "
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


def build_context_scores(
    profiles: list[dict],
    service_context: pd.DataFrame | None = None,
    demand_context: pd.DataFrame | None = None,
) -> list[dict]:
    """Attach derived suitability context indicators to the approved profile payload."""
    if service_context is not None and not service_context.empty:
        service = service_context.copy()
        service["SA2_CODE_2021"] = service["SA2_CODE_2021"].astype(str)
        service = service.set_index("SA2_CODE_2021")
    else:
        service = None
    demand_reference_year: int | None = None
    if demand_context is not None and not demand_context.empty:
        demand = demand_context.copy()
        demand = demand[demand["sex"].eq("persons")].copy()
        if "projection_year" in demand.columns:
            demand["projection_year"] = pd.to_numeric(demand["projection_year"], errors="coerce")
            if demand["projection_year"].notna().any():
                demand_reference_year = int(demand["projection_year"].max())
                demand = demand[demand["projection_year"].eq(demand_reference_year)].copy()
        demand["sa2_code_2021"] = demand["sa2_code_2021"].astype(str)
        demand = demand.drop_duplicates(subset=["sa2_code_2021"]).set_index("sa2_code_2021")
    else:
        demand = None
    for profile in profiles:
        area_id = str(profile["neighbourhood"]["id"])
        env_domain = next((domain for domain in profile["domains"] if domain["name"] == "Environment"), None)
        if env_domain is None:
            continue

        if service is not None and area_id in service.index:
            row = service.loc[area_id]
            service_count = pd.to_numeric(row.get("active_education_care_services", 0), errors="coerce")
            places = pd.to_numeric(row.get("total_approved_places", 0), errors="coerce")
            nearest_service = pd.to_numeric(row.get("nearest_active_service_km", np.nan), errors="coerce")
            rating_coverage = pd.to_numeric(row.get("rating_coverage_pct", np.nan), errors="coerce")
            items: list[float] = []
            if pd.notna(service_count):
                items.append(min(100.0, float(service_count) * 12.5))
            if pd.notna(places):
                items.append(min(100.0, float(places) / 8.0))
            if pd.notna(nearest_service):
                items.append(max(0.0, (1.5 - float(nearest_service)) / 1.5 * 100.0))
            if pd.notna(rating_coverage):
                items.append(min(100.0, float(rating_coverage)))
            service_score = sum(items) / len(items) if items else None
            env_domain["indicators"].append({
                "id": "service_access_score",
                "name": "Service access score",
                "value": round(float(service_score), 4) if service_score is not None else None,
                "unit": "score",
                "status": "available" if service_score is not None else "unavailable",
                "source": "ACECQA / Vicmap service context",
                "geographic_unit": GEO_UNIT,
                "reference_year": "2026",
            })

        if demand is not None and area_id in demand.index:
            row = demand.loc[area_id]
            if isinstance(row, pd.Series):
                projected = row.get("population_age_0_14_projected", np.nan)
            else:
                projected = np.nan
            projected_value = pd.to_numeric(projected, errors="coerce")
            if isinstance(projected_value, pd.Series):
                projected_value = projected_value.iloc[0] if not projected_value.empty else np.nan
            demand_score = None if pd.isna(projected_value) else min(100.0, (float(projected_value) / 5000.0) * 100.0)
            env_domain["indicators"].append({
                "id": "future_demand_score",
                "name": "Future demand score",
                "value": round(float(demand_score), 4) if demand_score is not None else None,
                "unit": "score",
                "status": "available" if demand_score is not None else "unavailable",
                "source": "Victoria in Future 2023",
                "geographic_unit": GEO_UNIT,
                "reference_year": str(demand_reference_year) if demand_reference_year is not None else "2021",
            })

        vegetation = next((indicator for indicator in env_domain["indicators"] if indicator["id"] == "env_vegetation_cover"), None)
        heat = next((indicator for indicator in env_domain["indicators"] if indicator["id"] == "env_urban_heat"), None)
        open_space = next((indicator for indicator in env_domain["indicators"] if indicator["id"] == "env_open_space_access"), None)
        components: list[float] = []
        if vegetation is not None and vegetation.get("status") == "available":
            components.append(float(vegetation["value"]))
        if heat is not None and heat.get("status") == "available":
            components.append(max(0.0, 100.0 - float(heat["value"]) * 3.0))
        if open_space is not None and open_space.get("status") == "available":
            components.append(float(open_space["value"]))
        quality_score = sum(components) / len(components) if components else None
        env_domain["indicators"].append({
            "id": "environment_quality_score",
            "name": "Environment quality score",
            "value": round(float(quality_score), 4) if quality_score is not None else None,
            "unit": "score",
            "status": "available" if quality_score is not None else "unavailable",
            "source": "Derived from environmental context",
            "geographic_unit": GEO_UNIT,
            "reference_year": "2024",
        })
    return profiles


def build_suitability(
    profiles: list[dict], supplemental_scores: pd.DataFrame | None = None
) -> dict:
    """Build scalable per-criterion scores plus auditable source measures."""
    localities = build_criterion_scores(profiles)
    if supplemental_scores is not None:
        score_columns = {
            "general_practice_access": "general_practice_access_score",
            "hospital_access": "hospital_access_score",
            "pharmacy_access": "pharmacy_access_score",
            "lower_industrial_emission_source_presence": "lower_industrial_source_presence_score",
            "lower_declared_road_traffic": "lower_declared_road_traffic_score",
            "public_transport_availability": "public_transport_availability_score",
            "lower_bushfire_prone_share": "lower_bushfire_prone_share_score",
            "approved_early_childhood_places": "approved_early_childhood_places_score",
            "long_day_care_availability": "long_day_care_availability_score",
            "kindergarten_availability": "kindergarten_availability_score",
            "primary_school_campus_availability": "primary_school_campus_availability_score",
        }
        measure_columns = {
            "general_practice_access": "general_practice_per_10000",
            "hospital_access": "hospital_per_10000",
            "pharmacy_access": "pharmacy_per_10000",
            "lower_industrial_emission_source_presence": "npi_reporting_facility_count",
            "lower_declared_road_traffic": "declared_road_traffic_intensity",
            "public_transport_availability": "public_transport_stops_per_10000",
            "lower_bushfire_prone_share": "bushfire_prone_pct",
            "approved_early_childhood_places": "approved_places_per_1000_children_0_4",
            "long_day_care_availability": "long_day_care_services_per_1000_children_0_4",
            "kindergarten_availability": "kindergarten_services_per_1000_children_0_4",
            "primary_school_campus_availability": "primary_school_campuses_per_1000_children_5_9",
        }
        by_id = supplemental_scores.assign(
            neighbourhood_id=supplemental_scores.neighbourhood_id.astype(str)
        ).set_index("neighbourhood_id")
        for locality in localities:
            if locality["id"] not in by_id.index:
                continue
            row = by_id.loc[locality["id"]]
            for criterion, column in score_columns.items():
                if column in row.index:
                    locality["scores"][criterion] = _num(row[column])
            for criterion, column in measure_columns.items():
                if column in row.index:
                    locality["measures"][criterion] = _num(row[column])
    return {
        "localities": localities,
        "metadata": {
            "source": "Approved profile and Iteration 2 context datasets",
            "reference_year": "2024-2026",
            "geographic_unit": GEO_UNIT,
            "data_quality": "Per-criterion source measures and documented Greater Melbourne comparison scores.",
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
    if "match_community_id" not in idx.columns:
        raise ValueError("Stable match_community_id is required to build comparison artefacts")
    peer_lookup = idx.set_index("community_id", drop=False, verify_integrity=True)
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
        if pd.isna(r.match_community_id) or not str(r.match_community_id).strip():
            matches.append({"source_neighbourhood": src, "matched_neighbourhood": None,
                            "match_strength": None, "similarity_basis": [], "status": "no_match",
                            "limitations": [{"code": "no_comparable_community",
                                             "message": "No community within the same region is similar enough on the matching measures to support a fair comparison.",
                                             "affected_fields": ["matched_neighbourhood"]}]})
            continue
        if r.match_community_id not in peer_lookup.index:
            raise ValueError(f"Unknown matched community identifier: {r.match_community_id}")
        p = peer_lookup.loc[r.match_community_id]
        if p.community_id == r.community_id:
            raise ValueError("A community cannot be its own comparison")
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
            "metadata": {"source": "KinderPrint matching model M4 (stratified Mahalanobis with caliper)",
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
