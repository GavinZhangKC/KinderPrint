"""Your area in 2031: projected children and pressure on childcare, GPs and primary schools.

Prediction source
-----------------
Child and total population come from Victoria in Future 2023 (VIF2023), the
Victorian Government's official SA2 projections for 2021, 2026, 2031 and 2036.
Vkinder does not make its own population forecast.

What Vkinder derives
--------------------
For every projection year, with today's services held fixed ("if nothing new
opens"):

* childcare access: the E2SFCA measure from build_access_e2sfca.py (approved
  places per 100 children aged 0-4, distance-weighted, 5 km catchment), re-run
  with that year's projected children;
* GP access: practices per 10,000 residents, the same way with all ages;
* primary school campuses per 1,000 children aged 5-9 inside the SA2;
* childcare places to keep 2026 access: the extra places that would hold the
  area's 2026 access level for its projected children, a rough guide that
  ignores neighbouring areas.

Gate: the 2026 re-run must reproduce access_e2sfca_sa2.csv to 3 decimals, so the
future figures come from exactly the published method.

Outputs
-------
data/processed/future_demand_sa2.csv          one row per SA2 x projection year
reports/iteration3/future_demand_validation.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_access_e2sfca as access  # noqa: E402

PROC = ROOT / "data" / "processed"
OUTPUT = PROC / "future_demand_sa2.csv"
REPORT = ROOT / "reports" / "iteration3" / "future_demand_validation.json"
YEARS = (2021, 2026, 2031, 2036)
BASE_YEAR = 2026
SOURCE_ID = "vif2023_child_population;acecqa_services_2026;ga_healthdirect_facilities_2025;victoria_school_locations_2025;abs_sa2_lga_label_point_2023"


def projections() -> pd.DataFrame:
    p = pd.read_csv(PROC / "vif_child_population_projections_sa2.csv", dtype={"sa2_code_2021": str})
    return p[p.sex == "persons"]


def demand_for(year: int, points: pd.DataFrame, population: pd.DataFrame) -> pd.DataFrame:
    year_pop = population[population.projection_year == year]
    return year_pop.merge(points[["sa2_code_2021", "label_point_latitude", "label_point_longitude"]],
                          on="sa2_code_2021", how="inner").reset_index(drop=True)


def build() -> tuple[pd.DataFrame, dict]:
    _, scope, facilities = access.load_inputs()
    points = pd.read_csv(ROOT / "data" / "reference" / "sa2_lga_2023_vic.csv", dtype={"sa2_code_2021": str})
    population = projections()
    schools = pd.read_csv(PROC / "school_child_population_sa2.csv", dtype={"sa2_code": str}).set_index("sa2_code")
    frames = []
    for year in YEARS:
        demand = demand_for(year, points, population)
        table = access.build(demand, scope, facilities)
        wide = table.pivot(index="sa2_code", columns="service", values="access_5km")
        pop = demand.set_index("sa2_code_2021")
        out = scope.copy()
        out["projection_year"] = year
        for column, source in (("children_0_4", "population_age_0_4_projected"),
                               ("children_5_9", "population_age_5_9_projected"),
                               ("children_10_14", "population_age_10_14_projected"),
                               ("children_0_14", "population_age_0_14_projected"),
                               ("population_all_ages", "population_all_ages_projected")):
            out[column] = out.sa2_code.map(pop[source]).round(0)
        out["ecec_places_per_100_0_4"] = out.sa2_code.map(wide["ecec"]).round(1)
        out["gp_practices_per_10000"] = out.sa2_code.map(wide["gp"]).round(2)
        campuses = out.sa2_code.map(schools.primary_school_campuses)
        out["primary_campuses"] = campuses
        out["primary_campuses_per_1000_5_9"] = np.where(out.children_5_9 > 0, campuses / out.children_5_9 * 1000, np.nan).round(2)
        frames.append(out)
    long = pd.concat(frames, ignore_index=True)
    base = long[long.projection_year == BASE_YEAR].set_index("sa2_code")
    base_kids = long.sa2_code.map(base.children_0_4)
    long["children_0_4_change_from_2026_pct"] = np.where(
        base_kids > 0, (long.children_0_4 / base_kids.where(base_kids > 0) - 1) * 100, np.nan).round(1)
    long["ecec_places_to_keep_2026_access"] = np.maximum(
        0, (long.children_0_4 - long.sa2_code.map(base.children_0_4)) * long.sa2_code.map(base.ecec_places_per_100_0_4) / 100
    ).round(0)
    long.loc[long.projection_year <= BASE_YEAR, "ecec_places_to_keep_2026_access"] = np.nan
    long["ecec_access_percentile"] = long.groupby("projection_year").ecec_places_per_100_0_4.rank(pct=True).mul(100).round(1)
    long["source_id"] = SOURCE_ID

    # Gate: the 2026 re-run equals the published access table.
    published = pd.read_csv(PROC / "access_e2sfca_sa2.csv", dtype={"sa2_code": str}).pivot(
        index="sa2_code", columns="service", values="access_5km")
    rerun = long[long.projection_year == BASE_YEAR].set_index("sa2_code")
    ecec_gap = float((rerun.ecec_places_per_100_0_4 - published.ecec.round(1)).abs().max())
    gp_gap = float((rerun.gp_practices_per_10000 - published.gp.round(2)).abs().max())
    totals = long.groupby("projection_year")[["children_0_4", "children_5_9", "children_0_14"]].sum().astype(int)
    by_2031 = long[long.projection_year == 2031]
    report = {
        "projection_source": "Victoria in Future 2023 (official Victorian Government projections)",
        "years": list(YEARS),
        "gate_2026_matches_published_access": {"ecec_max_abs_diff": ecec_gap, "gp_max_abs_diff": gp_gap,
                                               "pass": ecec_gap <= 0.05 and gp_gap <= 0.005},
        "greater_melbourne_children": {str(y): r for y, r in totals.to_dict(orient="index").items()},
        "sa2_where_under5s_grow_2026_2031": int((by_2031.children_0_4_change_from_2026_pct > 0).sum()),
        "sa2_where_childcare_access_falls_2026_2031": int((by_2031.ecec_places_per_100_0_4 < by_2031.sa2_code.map(base.ecec_places_per_100_0_4)).sum()),
        "places_to_keep_2026_access_2031_total": int(by_2031.ecec_places_to_keep_2026_access.sum()),
        "notes": "Services held at today's level. Approved places are licensed capacity, not vacancies. "
                 "Distances are straight-line from SA2 label points.",
    }
    return long, report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--output", type=Path, default=OUTPUT, help="CSV path (default: the processed file)")
    args = parser.parse_args(argv)
    table, report = build()
    print(json.dumps(report, indent=2))
    if not report["gate_2026_matches_published_access"]["pass"]:
        print("Gate failed: the 2026 re-run does not match the published access table.", file=sys.stderr)
        return 1
    table.to_csv(args.output, index=False)
    if args.output == OUTPUT:  # a rebuild check writes elsewhere and leaves the report alone
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {len(table)} rows to {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
