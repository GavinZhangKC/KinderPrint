"""Spatial access to GPs and early childhood education and care (E2SFCA) by SA2.

Why this replaces "services in the suburb"
------------------------------------------
Counting facilities inside an SA2 ignores two facts. Families cross SA2
boundaries, and a practice or centre near many families is shared by all of
them. The enhanced two-step floating catchment area method (Luo & Qi 2009, with
the Gaussian decay of Dai 2010) handles both:

    step 1  R_j = S_j / sum_k P_k W(d_kj)     supply-to-demand ratio at facility j
    step 2  A_i = sum_j R_j W(d_ij)           access of area i

    W(d) = (exp(-0.5 (d/d0)^2) - exp(-0.5)) / (1 - exp(-0.5))  for d <= d0, else 0

Inputs
------
data/processed/healthdirect_facilities.csv          general practices (supply = 1 per practice)
data/processed/early_childhood_services.csv         centre-based and family day care
                                                     (supply = approved places; closed services excluded)
data/processed/vif_child_population_projections_sa2.csv  2026 projection, persons:
                                                     all ages for GP demand, 0-4 for ECEC demand
data/reference/sa2_lga_2023_vic.csv                 SA2 label points (demand locations)
data/processed/healthdirect_facility_counts_sa2.csv the 361 SA2s in scope

Demand includes every projected SA2 around the scope, not just the 361 in scope,
so SA2s on the edge of the scope are not credited with supply that neighbouring
areas also use.

Outputs
-------
data/processed/access_e2sfca_sa2.csv    one row per SA2 x service
reports/iteration3/access_e2sfca_diagnostics.json
    catchment sensitivity (Spearman 3 vs 5 vs 10 km), agreement with the naive
    in-SA2 ratio, population-weighted Gini, and the share of children in the
    lowest-access fifth by IRSD quintile

Limits: distances are straight-line from SA2 label points, not travel time; a
practice counts as one unit because GP FTE is not published at practice level;
approved places are licensed capacity, not vacancies.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed"
REF = ROOT / "data" / "reference"
OUTPUT = PROC / "access_e2sfca_sa2.csv"
DIAGNOSTICS = ROOT / "reports" / "iteration3" / "access_e2sfca_diagnostics.json"
PROJECTION_YEAR = 2026
CATCHMENTS_KM = (3.0, 5.0, 10.0)
PRIMARY_KM = 5.0
SERVICES = {
    "gp": {"label": "General practices", "demand": "population_all_ages_projected",
           "scale": 10_000, "unit": "practices per 10,000 residents (distance-weighted)",
           "source_id": "ga_healthdirect_facilities_2025;vif2023_child_population;abs_sa2_lga_label_point_2023"},
    "ecec": {"label": "Early childhood education and care", "demand": "population_age_0_4_projected",
             "scale": 100, "unit": "approved places per 100 children aged 0-4 (distance-weighted)",
             "source_id": "acecqa_services_2026;vif2023_child_population;abs_sa2_lga_label_point_2023"},
}


def haversine_matrix(lat_a, lon_a, lat_b, lon_b) -> np.ndarray:
    la, lb = np.radians(np.asarray(lat_a, float))[:, None], np.radians(np.asarray(lat_b, float))[None, :]
    dl = np.radians(np.asarray(lon_b, float))[None, :] - np.radians(np.asarray(lon_a, float))[:, None]
    a = np.sin((lb - la) / 2) ** 2 + np.cos(la) * np.cos(lb) * np.sin(dl / 2) ** 2
    return 2 * 6371.0088 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def gaussian_weight(distance: np.ndarray, d0: float) -> np.ndarray:
    edge = np.exp(-0.5)
    w = (np.exp(-0.5 * (distance / d0) ** 2) - edge) / (1 - edge)
    return np.where(distance <= d0, w, 0.0)


def e2sfca(demand: np.ndarray, supply: np.ndarray, distance: np.ndarray, d0: float) -> np.ndarray:
    """distance: areas x facilities. Returns access per unit of demand for each area."""
    weights = gaussian_weight(distance, d0)
    weighted_demand = demand @ weights                     # per facility
    ratio = np.divide(supply, weighted_demand, out=np.zeros_like(supply, dtype=float),
                      where=weighted_demand > 0)
    return weights @ ratio


def weighted_gini(values: np.ndarray, weights: np.ndarray) -> float:
    order = np.argsort(values)
    v, w = values[order], weights[order]
    cum_w = np.cumsum(w) / w.sum()
    cum_vw = np.cumsum(v * w) / (v * w).sum()
    return float(1 - np.sum((cum_w - np.r_[0, cum_w[:-1]]) * (cum_vw + np.r_[0, cum_vw[:-1]])))


def load_inputs():
    points = pd.read_csv(REF / "sa2_lga_2023_vic.csv", dtype={"sa2_code_2021": str})
    population = pd.read_csv(PROC / "vif_child_population_projections_sa2.csv", dtype={"sa2_code_2021": str})
    population = population[(population.projection_year == PROJECTION_YEAR) & (population.sex == "persons")]
    demand = population.merge(points[["sa2_code_2021", "label_point_latitude", "label_point_longitude"]],
                              on="sa2_code_2021", how="inner")
    scope = pd.read_csv(PROC / "healthdirect_facility_counts_sa2.csv", dtype={"sa2_code": str})[["sa2_code", "sa2_name"]]
    gp = pd.read_csv(PROC / "healthdirect_facilities.csv", dtype={"sa2_code": str})
    gp = gp[(gp.facility_category == "general_practice") & (gp.operational_status == "active")]
    ecec = pd.read_csv(PROC / "early_childhood_services.csv", dtype={"SA2_CODE_2021": str})
    ecec = ecec[~ecec.is_temporarily_closed.astype(bool) & ecec.approved_places.notna()]
    facilities = {
        "gp": pd.DataFrame({"latitude": gp.latitude, "longitude": gp.longitude, "supply": 1.0,
                            "sa2_code": gp.sa2_code}),
        "ecec": pd.DataFrame({"latitude": ecec.latitude, "longitude": ecec.longitude,
                              "supply": ecec.approved_places.astype(float), "sa2_code": ecec.SA2_CODE_2021}),
    }
    return demand.reset_index(drop=True), scope, facilities


def build(demand: pd.DataFrame, scope: pd.DataFrame, facilities: dict[str, pd.DataFrame]) -> pd.DataFrame:
    missing = set(scope.sa2_code) - set(demand.sa2_code_2021)
    if missing:
        raise ValueError(f"{len(missing)} SA2s in scope have no population or label point: {sorted(missing)[:5]}")
    rows = []
    for service, spec in SERVICES.items():
        fac = facilities[service].dropna(subset=["latitude", "longitude"])
        distance = haversine_matrix(demand.label_point_latitude, demand.label_point_longitude,
                                    fac.latitude, fac.longitude)
        pop = demand[spec["demand"]].to_numpy(float)
        frame = pd.DataFrame({"sa2_code": demand.sa2_code_2021, "demand_population": pop,
                              "nearest_km": distance.min(axis=1).round(2)})
        for d0 in CATCHMENTS_KM:
            frame[f"access_{int(d0)}km"] = (e2sfca(pop, fac.supply.to_numpy(float), distance, d0) * spec["scale"]).round(3)
        in_area = fac.groupby("sa2_code").supply.sum()
        frame["in_sa2_supply"] = frame.sa2_code.map(in_area).fillna(0.0)
        frame["naive_ratio"] = np.where(pop > 0, frame.in_sa2_supply / pop * spec["scale"], np.nan).round(3)
        frame = scope.merge(frame, on="sa2_code", how="left")
        frame["access_percentile"] = (frame[f"access_{int(PRIMARY_KM)}km"].rank(pct=True) * 100).round(1)
        frame["service"] = service
        frame["service_label"] = spec["label"]
        frame["unit"] = spec["unit"]
        frame["primary_catchment_km"] = PRIMARY_KM
        frame["source_id"] = spec["source_id"]
        rows.append(frame)
    columns = ["sa2_code", "sa2_name", "service", "service_label", "unit", "demand_population",
               "access_3km", "access_5km", "access_10km", "primary_catchment_km", "access_percentile",
               "naive_ratio", "in_sa2_supply", "nearest_km", "source_id"]
    return pd.concat(rows, ignore_index=True)[columns]


def diagnostics(access: pd.DataFrame) -> dict:
    socio = pd.read_csv(PROC / "analytical_table.csv", dtype={"community_id": str})
    bridge = pd.read_csv(PROC / "community_sa2.csv", dtype={"community_id": str, "sa2_code_2021": str})
    irsd = bridge.merge(socio[["community_id", "irsd_score"]], on="community_id").set_index("sa2_code_2021").irsd_score
    out = {}
    for service, frame in access.groupby("service"):
        frame = frame.dropna(subset=["access_5km"])
        rho = {f"{a}km_vs_{b}km": round(float(spearmanr(frame[f"access_{a}km"], frame[f"access_{b}km"]).statistic), 3)
               for a, b in ((3, 5), (5, 10), (3, 10))}
        naive = frame.dropna(subset=["naive_ratio"])
        weights = frame.demand_population.to_numpy(float)
        frame = frame.assign(irsd=frame.sa2_code.map(irsd))
        frame["irsd_quintile"] = pd.qcut(frame.irsd.rank(method="first"), 5, labels=[1, 2, 3, 4, 5])
        low = frame.access_5km <= frame.access_5km.quantile(0.2)
        by_quintile = frame.assign(low=low).groupby("irsd_quintile", observed=True).apply(
            lambda g: round(float((g.low * g.demand_population).sum() / g.demand_population.sum()), 3),
            include_groups=False).to_dict()
        out[service] = {
            "sa2_count": int(len(frame)),
            "catchment_sensitivity_spearman": rho,
            "spearman_vs_naive_in_sa2_ratio": round(float(spearmanr(naive.access_5km, naive.naive_ratio).statistic), 3),
            "sa2_with_zero_supply_inside": int((frame.in_sa2_supply == 0).sum()),
            "sa2_with_zero_access_5km": int((frame.access_5km == 0).sum()),
            "population_weighted_gini_5km": round(weighted_gini(frame.access_5km.to_numpy(float), weights), 3),
            "median_access_5km": round(float(frame.access_5km.median()), 3),
            "share_of_demand_in_lowest_access_fifth_by_irsd_quintile": {str(k): v for k, v in by_quintile.items()},
            "note": "IRSD quintile 1 = most disadvantaged. Equal shares (0.2) would mean low access is not "
                    "concentrated by disadvantage.",
        }
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    demand, scope, facilities = load_inputs()
    access = build(demand, scope, facilities)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    access.to_csv(args.output, index=False)
    report = diagnostics(access)
    DIAGNOSTICS.parent.mkdir(parents=True, exist_ok=True)
    DIAGNOSTICS.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {len(access)} rows to {args.output}")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
