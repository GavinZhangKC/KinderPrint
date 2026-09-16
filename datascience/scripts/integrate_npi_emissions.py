"""Integrate current National Pollutant Inventory facility-source context."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd


TARGET_SUBSTANCES = {
    "Particulate Matter ≤2.5 µm (PM2.5)": "PM2.5",
    "Particulate Matter ≤10.0 µm (PM10)": "PM10",
    "Oxides of Nitrogen": "NOx",
    "Sulfur dioxide": "SO2",
    "Carbon monoxide": "CO",
    "Total Volatile Organic Compounds": "VOC",
    "Benzene": "benzene",
    "Formaldehyde (methyl aldehyde)": "formaldehyde",
    "Polycyclic aromatic hydrocarbons (B[a]Peq)": "PAH_BaPeq",
}


def inverse_presence_score(values: pd.Series) -> pd.Series:
    """Return 100 for no listed facility and lower percentiles for more facilities."""
    numeric = pd.to_numeric(values, errors="coerce")
    percentile = numeric.rank(method="average", pct=True) * 100
    score = (100 - percentile).where(numeric > 0, 100)
    return score.where(numeric.notna()).round(2)


def integrate_npi(source: Path, boundaries: Path, report_year: str) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    usecols = [
        "report_year", "facility_id", "facility_name", "registered_business_name",
        "primary_anzsic_class_name", "substance_name", "air_total_emission_kg",
        "suburb", "state", "postcode", "latitude", "longitude",
    ]
    raw = pd.read_excel(source, sheet_name="Emissions", usecols=usecols)
    selected = raw.loc[
        raw.report_year.astype(str).eq(report_year)
        & raw.state.eq("VIC")
        & raw.substance_name.isin(TARGET_SUBSTANCES)
        & raw.air_total_emission_kg.notna()
        & raw.latitude.notna()
        & raw.longitude.notna()
    ].copy()
    selected["pollutant"] = selected.substance_name.map(TARGET_SUBSTANCES)
    points = gpd.GeoDataFrame(
        selected,
        geometry=gpd.points_from_xy(selected.longitude, selected.latitude),
        crs="EPSG:4326",
    ).to_crs("EPSG:7844")
    sa2 = gpd.read_file(boundaries).to_crs("EPSG:7844")
    code_column = "id" if "id" in sa2 else "SA2_CODE_2021"
    name_column = "name" if "name" in sa2 else "SA2_NAME_2021"
    joined = gpd.sjoin(
        points,
        sa2[[code_column, name_column, "geometry"]].rename(
            columns={code_column: "sa2_code", name_column: "sa2_name"}
        ),
        how="inner",
        predicate="within",
    )
    records = pd.DataFrame({
        "report_year": joined.report_year,
        "facility_id": joined.facility_id.astype(str),
        "facility_name": joined.facility_name,
        "business_name": joined.registered_business_name,
        "industry": joined.primary_anzsic_class_name,
        "pollutant": joined.pollutant,
        "substance_name": joined.substance_name,
        "air_total_emission_kg": joined.air_total_emission_kg,
        "longitude": joined.geometry.x,
        "latitude": joined.geometry.y,
        "sa2_code": joined.sa2_code.astype(str),
        "sa2_name": joined.sa2_name,
        "source_id": "npi_emissions_2024_2025",
    }).sort_values(["sa2_name", "facility_name", "pollutant"])
    facility_counts = (
        records.groupby(["sa2_code", "sa2_name"]).facility_id.nunique()
        .rename("npi_reporting_facility_count").reset_index()
    )
    all_sa2 = sa2[[code_column, name_column]].rename(
        columns={code_column: "sa2_code", name_column: "sa2_name"}
    )
    all_sa2.sa2_code = all_sa2.sa2_code.astype(str)
    summary = all_sa2.merge(facility_counts, on=["sa2_code", "sa2_name"], how="left")
    summary["npi_reporting_facility_count"] = summary.npi_reporting_facility_count.fillna(0).astype(int)
    summary["lower_industrial_source_presence_score"] = inverse_presence_score(
        summary.npi_reporting_facility_count
    )
    summary["source_id"] = "npi_emissions_2024_2025"
    qa = {
        "source_id": "npi_emissions_2024_2025",
        "report_year": report_year,
        "target_pollutants": list(TARGET_SUBSTANCES.values()),
        "greater_melbourne_pollutant_records": len(records),
        "greater_melbourne_reporting_facilities": int(records.facility_id.nunique()),
        "sa2_with_reporting_facility": int((summary.npi_reporting_facility_count > 0).sum()),
        "sa2_without_reporting_facility": int((summary.npi_reporting_facility_count == 0).sum()),
        "limitation": (
            "NPI data are facility-reported or estimated emissions above reporting thresholds. "
            "Facility presence and emitted mass are not ambient concentration, toxic-equivalent "
            "exposure, individual dose, compliance status or health risk. A zero means no facility "
            "in this selected extract, not zero pollution."
        ),
    }
    return records, summary, qa


def aggregate_reporting_localities(
    summary: pd.DataFrame, bridge: pd.DataFrame, localities: pd.DataFrame
) -> pd.DataFrame:
    bridge = bridge.copy()
    summary = summary.copy()
    bridge["sa2_code_2021"] = bridge.sa2_code_2021.astype(str)
    summary["sa2_code"] = summary.sa2_code.astype(str)
    component = bridge.merge(
        summary[["sa2_code", "npi_reporting_facility_count"]],
        left_on="sa2_code_2021", right_on="sa2_code", how="left",
    )
    aggregate = component.groupby("community_id", as_index=False).npi_reporting_facility_count.sum()
    output = localities[["community_id", "neighbourhood_id", "community_name"]].merge(
        aggregate, on="community_id", how="left"
    )
    output["npi_reporting_facility_count"] = output.npi_reporting_facility_count.fillna(0).astype(int)
    output["lower_industrial_source_presence_score"] = inverse_presence_score(
        output.npi_reporting_facility_count
    )
    output["source_id"] = "npi_emissions_2024_2025"
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--boundaries", type=Path, required=True)
    parser.add_argument("--records-output", type=Path, required=True)
    parser.add_argument("--summary-output", type=Path, required=True)
    parser.add_argument("--bridge", type=Path, required=True)
    parser.add_argument("--localities", type=Path, required=True)
    parser.add_argument("--community-output", type=Path, required=True)
    parser.add_argument("--qa", type=Path, required=True)
    parser.add_argument("--report-year", default="2024/2025")
    args = parser.parse_args()
    records, summary, qa = integrate_npi(args.input, args.boundaries, args.report_year)
    community = aggregate_reporting_localities(
        summary, pd.read_csv(args.bridge), pd.read_csv(args.localities)
    )
    qa["reporting_localities"] = len(community)
    qa["reporting_localities_with_source"] = int(
        (community.npi_reporting_facility_count > 0).sum()
    )
    for path in (args.records_output, args.summary_output, args.community_output, args.qa):
        path.parent.mkdir(parents=True, exist_ok=True)
    records.to_csv(args.records_output, index=False)
    summary.to_csv(args.summary_output, index=False)
    community.to_csv(args.community_output, index=False)
    args.qa.write_text(json.dumps(qa, indent=2) + "\n")


if __name__ == "__main__":
    main()
