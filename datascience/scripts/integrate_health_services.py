"""Validate and spatially harmonise authoritative child-health service locations."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd


def integrate_casey_mch(source: Path, boundaries: Path) -> tuple[pd.DataFrame, dict]:
    services = gpd.read_file(source).to_crs("EPSG:7844")
    sa2 = gpd.read_file(boundaries).to_crs("EPSG:7844")
    if not services.geometry.geom_type.eq("Point").all():
        raise ValueError("Every MCH service geometry must be a point.")
    if services.geometry.is_empty.any() or services.geometry.isna().any():
        raise ValueError("MCH service coordinates cannot be missing or empty.")

    joined = gpd.sjoin(
        services,
        sa2[["id", "name", "geometry"]].rename(
            columns={"id": "sa2_code", "name": "sa2_name"}
        ),
        how="left",
        predicate="within",
    )
    output = pd.DataFrame({
        "service_id": [f"casey_mch_{i + 1:03d}" for i in range(len(joined))],
        "service_name": joined["name"].astype(str).str.strip(),
        "service_category": "maternal_child_health",
        "address": (
            joined["streetno"].fillna("").astype(str).str.strip()
            + ", " + joined["suburbpc"].fillna("").astype(str).str.strip()
        ).str.strip(", "),
        "phone": joined["phoneno"].fillna("").astype(str).str.strip(),
        "opening_hours": joined["openinghrs"].fillna("").astype(str).str.strip(),
        "appointments_available": joined["saturdaysession"].fillna("").astype(str).str.strip(),
        "longitude": joined.geometry.x,
        "latitude": joined.geometry.y,
        "sa2_code": joined["sa2_code"],
        "sa2_name": joined["sa2_name"],
        "coverage_scope": "City of Casey only",
        "source_id": "casey_mch_centres_2026",
    })
    duplicates = int(output.duplicated(["service_name", "address"]).sum())
    qa = {
        "source_id": "casey_mch_centres_2026",
        "records_received": len(output),
        "valid_point_geometries": int(joined.geometry.notna().sum()),
        "unique_name_address_records": len(output) - duplicates,
        "duplicate_name_address_records": duplicates,
        "sa2_assignment_success": int(output.sa2_code.notna().sum()),
        "sa2_assignment_failed": int(output.sa2_code.isna().sum()),
        "coverage_scope": "City of Casey only",
        "suitability_status": "limited",
        "limitation": (
            "This source cannot rank Greater Melbourne. It represents one council and "
            "does not report service capacity, waiting time, eligibility or quality."
        ),
    }
    return output, qa


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--casey-mch", type=Path, required=True)
    parser.add_argument("--boundaries", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--qa", type=Path, required=True)
    args = parser.parse_args()

    output, qa = integrate_casey_mch(args.casey_mch, args.boundaries)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.qa.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output, index=False)
    args.qa.write_text(json.dumps(qa, indent=2) + "\n")


if __name__ == "__main__":
    main()
