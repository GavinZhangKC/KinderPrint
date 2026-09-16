"""Spatially integrate public HealthDirect facility points for Greater Melbourne."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd


FILE_CATEGORIES = {
    "general_practice": "general_practice",
    "hospital": "hospital",
    "pharmacy": "pharmacy",
}


def category_from_filename(path: Path) -> str:
    stem = path.stem.lower()
    for prefix, category in FILE_CATEGORIES.items():
        if stem.startswith(prefix):
            return category
    raise ValueError(f"Unsupported HealthDirect layer filename: {path.name}")


def integrate_facilities(input_dir: Path, boundaries: Path) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    frames: list[gpd.GeoDataFrame] = []
    received: dict[str, int] = {}
    for path in sorted(input_dir.glob("*.geojson")):
        category = category_from_filename(path)
        frame = gpd.read_file(path).to_crs("EPSG:7844")
        frame["facility_category"] = category
        frames.append(frame)
        received[category] = received.get(category, 0) + len(frame)
    if not frames:
        raise FileNotFoundError(f"No HealthDirect GeoJSON layers found in {input_dir}")

    facilities = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs=frames[0].crs)
    facilities = facilities.drop_duplicates(["facility_category", "nhsd_service_id"], keep="first")
    boundaries_frame = gpd.read_file(boundaries).to_crs("EPSG:7844")
    code_column = "id" if "id" in boundaries_frame else "SA2_CODE_2021"
    name_column = "name" if "name" in boundaries_frame else "SA2_NAME_2021"
    joined = gpd.sjoin(
        facilities,
        boundaries_frame[[code_column, name_column, "geometry"]].rename(
            columns={code_column: "sa2_code", name_column: "sa2_name"}
        ),
        how="inner",
        predicate="within",
    )
    output = pd.DataFrame({
        "facility_id": joined["nhsd_service_id"],
        "facility_name": joined["organisation_name"].astype(str).str.strip(),
        "facility_category": joined["facility_category"],
        "official_service_type": joined["nhsd_service_type"],
        "operational_status": joined["operationalstatus"],
        "address": joined["address"],
        "suburb": joined["suburb"],
        "postcode": joined["postcode"],
        "gnaf_address_detail_pid": joined["gnaf_address_detail_pid"],
        "longitude": joined.geometry.x,
        "latitude": joined.geometry.y,
        "sa2_code": joined["sa2_code"],
        "sa2_name": joined["sa2_name"],
        "source_date": pd.to_datetime(joined["ga_source_date"], unit="ms", errors="coerce").dt.date,
        "source_id": "ga_healthdirect_facilities_2025",
    }).sort_values(["facility_category", "sa2_name", "facility_name"])

    categories = sorted(FILE_CATEGORIES.values())
    counts = (
        output.groupby(["sa2_code", "sa2_name", "facility_category"])
        .size().unstack(fill_value=0).reindex(columns=categories, fill_value=0)
        .rename(columns=lambda category: f"{category}_count")
        .reset_index()
    )
    all_sa2 = boundaries_frame[[code_column, name_column]].rename(
        columns={code_column: "sa2_code", name_column: "sa2_name"}
    )
    counts = all_sa2.merge(counts, on=["sa2_code", "sa2_name"], how="left")
    count_columns = [f"{category}_count" for category in categories]
    counts[count_columns] = counts[count_columns].fillna(0).astype(int)
    counts["interpretation"] = "facility_presence_not_capacity_or_quality"
    counts["source_id"] = "ga_healthdirect_facilities_2025"

    qa = {
        "source_id": "ga_healthdirect_facilities_2025",
        "victorian_records_received_by_category": received,
        "unique_victorian_category_records": len(facilities),
        "unique_victorian_service_ids": int(facilities.nhsd_service_id.nunique()),
        "greater_melbourne_facilities": len(output),
        "greater_melbourne_by_category": output.facility_category.value_counts().sort_index().to_dict(),
        "sa2_count": len(counts),
        "facilities_with_sa2_assignment": len(output),
        "duplicate_category_service_records_removed": int(sum(received.values()) - len(facilities)),
        "suitability_status": "available_with_limitations",
        "supported_categories": categories,
        "unsupported_inferences": [
            "paediatric or other specialist availability",
            "service capacity",
            "waiting time",
            "affordability",
            "eligibility",
            "service quality",
        ],
        "limitation": (
            "Counts represent active listed facilities located inside each SA2. They do not measure "
            "capacity, opening hours, accessibility across SA2 boundaries, specialist staffing, "
            "waiting time, affordability, eligibility or quality."
        ),
    }
    return output, counts, qa


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--boundaries", type=Path, required=True)
    parser.add_argument("--facilities-output", type=Path, required=True)
    parser.add_argument("--counts-output", type=Path, required=True)
    parser.add_argument("--qa", type=Path, required=True)
    args = parser.parse_args()
    facilities, counts, qa = integrate_facilities(args.input_dir, args.boundaries)
    for path in (args.facilities_output, args.counts_output, args.qa):
        path.parent.mkdir(parents=True, exist_ok=True)
    facilities.to_csv(args.facilities_output, index=False)
    counts.to_csv(args.counts_output, index=False)
    args.qa.write_text(json.dumps(qa, indent=2) + "\n")


if __name__ == "__main__":
    main()
