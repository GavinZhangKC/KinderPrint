"""Deterministically geocode ACECQA services with official G-NAF records."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import geopandas as gpd
import pandas as pd


TYPE_ALIASES = {
    "RD": "ROAD", "ST": "STREET", "AVE": "AVENUE", "AV": "AVENUE",
    "DR": "DRIVE", "CT": "COURT", "CRES": "CRESCENT", "CR": "CRESCENT",
    "HWY": "HIGHWAY", "PDE": "PARADE", "PL": "PLACE", "TCE": "TERRACE",
    "BLVD": "BOULEVARD", "BVD": "BOULEVARD", "LN": "LANE", "CL": "CLOSE",
    "GR": "GROVE", "SQ": "SQUARE", "CCT": "CIRCUIT", "RTE": "ROUTE",
}


def clean(value: object) -> str:
    text = re.sub(r"[^A-Z0-9 ]+", " ", str(value).upper())
    tokens = [TYPE_ALIASES.get(token, token) for token in text.split()]
    return " ".join(tokens)


def address_candidates(address: object, suburb: object, postcode: object) -> list[str]:
    text = clean(address)
    locality = clean(suburb)
    post = re.sub(r"\D", "", str(postcode))[:4]
    candidates: list[str] = []
    for match in re.finditer(r"(?<!\d)(\d{1,5})(?:[A-Z])?(?!\d)", text):
        number = match.group(1)
        street = re.sub(r"^\s*(?:TO|-)?\s*\d{1,5}\s*", "", text[match.end():]).strip()
        if street:
            candidates.append("|".join((number, street, locality, post)))
    return list(dict.fromkeys(reversed(candidates)))


def build_gnaf_index(detail_path: Path, street_path: Path, locality_path: Path) -> pd.DataFrame:
    streets = pd.read_csv(street_path, sep="|", dtype=str, usecols=[
        "STREET_LOCALITY_PID", "STREET_NAME", "STREET_TYPE_CODE", "STREET_SUFFIX_CODE"
    ]).fillna("")
    streets["street"] = (
        streets.STREET_NAME + " " + streets.STREET_TYPE_CODE + " " + streets.STREET_SUFFIX_CODE
    ).map(clean)
    localities = pd.read_csv(locality_path, sep="|", dtype=str, usecols=[
        "LOCALITY_PID", "LOCALITY_NAME", "PRIMARY_POSTCODE"
    ]).fillna("")
    localities["locality"] = localities.LOCALITY_NAME.map(clean)
    parts: list[pd.DataFrame] = []
    columns = ["ADDRESS_DETAIL_PID", "DATE_RETIRED", "NUMBER_FIRST", "STREET_LOCALITY_PID",
               "LOCALITY_PID", "POSTCODE", "ALIAS_PRINCIPAL", "CONFIDENCE"]
    for chunk in pd.read_csv(detail_path, sep="|", dtype=str, usecols=columns, chunksize=250_000):
        chunk = chunk[chunk.DATE_RETIRED.isna() & chunk.NUMBER_FIRST.notna()]
        chunk = chunk.merge(streets[["STREET_LOCALITY_PID", "street"]], on="STREET_LOCALITY_PID")
        chunk = chunk.merge(localities[["LOCALITY_PID", "locality", "PRIMARY_POSTCODE"]], on="LOCALITY_PID")
        chunk["postcode"] = chunk.POSTCODE.fillna(chunk.PRIMARY_POSTCODE).fillna("")
        chunk["match_key"] = (
            chunk.NUMBER_FIRST.str.replace(r"\.0$", "", regex=True) + "|" + chunk.street + "|" +
            chunk.locality + "|" + chunk.postcode
        )
        parts.append(chunk[["ADDRESS_DETAIL_PID", "match_key", "ALIAS_PRINCIPAL", "CONFIDENCE"]])
    index = pd.concat(parts, ignore_index=True)
    counts = index.groupby("match_key").ADDRESS_DETAIL_PID.transform("nunique")
    return index[counts == 1].drop_duplicates("match_key")


def geocode(args: argparse.Namespace) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    services = pd.read_csv(args.services, dtype={"Postcode": str})
    index = build_gnaf_index(args.address_detail, args.street_locality, args.locality)
    key_to_pid = dict(zip(index.match_key, index.ADDRESS_DETAIL_PID))
    candidates = services.apply(
        lambda row: address_candidates(row.ServiceAddress, row.Suburb, row.Postcode), axis=1
    )
    services["normalised_address"] = services.apply(
        lambda r: " | ".join((clean(r.ServiceAddress), clean(r.Suburb), re.sub(r"\D", "", str(r.Postcode))[:4])), axis=1
    )
    services["matched_gnaf_identifier"] = candidates.map(
        lambda keys: next((key_to_pid[key] for key in keys if key in key_to_pid), pd.NA)
    )
    services["match_method"] = services.matched_gnaf_identifier.notna().map(
        {True: "DETERMINISTIC_STREET_ADDRESS", False: "NO_DETERMINISTIC_MATCH"}
    )
    services["match_status"] = services.matched_gnaf_identifier.notna().map(
        {True: "EXACT", False: "UNMATCHED"}
    )
    geocodes = pd.read_csv(args.geocodes, sep="|", dtype=str, usecols=[
        "ADDRESS_DETAIL_PID", "DATE_RETIRED", "LONGITUDE", "LATITUDE", "GEOCODE_TYPE_CODE"
    ])
    geocodes = geocodes[geocodes.DATE_RETIRED.isna()].drop_duplicates("ADDRESS_DETAIL_PID")
    services = services.merge(geocodes, left_on="matched_gnaf_identifier", right_on="ADDRESS_DETAIL_PID", how="left")
    points = gpd.GeoDataFrame(
        services, geometry=gpd.points_from_xy(pd.to_numeric(services.LONGITUDE), pd.to_numeric(services.LATITUDE)),
        crs="EPSG:7844",
    )
    boundaries = gpd.read_file(args.boundaries).to_crs(points.crs)
    boundaries = boundaries[["SA2_CODE_2021", "SA2_NAME_2021", "geometry"]].rename(
        columns={"SA2_CODE_2021": "id", "SA2_NAME_2021": "name"}
    )
    matched = gpd.sjoin(points[points.matched_gnaf_identifier.notna()], boundaries, predicate="within", how="left")
    points["assigned_sa2"] = pd.NA
    points.loc[matched.index, "assigned_sa2"] = matched.id.values
    points["assigned_kinderprint_locality"] = points.assigned_sa2
    points["included_in_spatial_analysis"] = points.assigned_sa2.notna() & points["Temporarily Closed"].ne("Yes")

    included = points[points.included_in_spatial_analysis].copy()
    included["approved_places"] = pd.to_numeric(included.NumberOfApprovedPlaces, errors="coerce").fillna(0)
    included["is_long_day_care"] = included["Long Day Care"].eq("Yes").astype(int)
    included["is_kindergarten"] = (
        included["Preschool/Kindergarten - Part of a School"].eq("Yes") |
        included["Preschool/Kindergarten - Stand alone"].eq("Yes")
    ).astype(int)
    agg = included.groupby("assigned_sa2", as_index=False).agg(
        approved_places=("approved_places", "sum"), long_day_care_services=("is_long_day_care", "sum"),
        kindergarten_services=("is_kindergarten", "sum"), acecqa_services=("ServiceApprovalNumber", "nunique")
    ).rename(columns={"assigned_sa2": "neighbourhood_id"})
    population = pd.read_csv(args.population)[["neighbourhood_id", "population"]]
    population.neighbourhood_id = population.neighbourhood_id.astype(str)
    agg.neighbourhood_id = agg.neighbourhood_id.astype(str)
    scores = population.merge(agg, on="neighbourhood_id", how="left").fillna({
        "approved_places": 0, "long_day_care_services": 0, "kindergarten_services": 0, "acecqa_services": 0
    })
    for value, score in [
        ("approved_places", "approved_early_childhood_places_score"),
        ("long_day_care_services", "long_day_care_availability_score"),
        ("kindergarten_services", "kindergarten_availability_score"),
    ]:
        scores[value + "_per_10000"] = 10_000 * scores[value] / scores.population
        scores[score] = scores[value + "_per_10000"].rank(method="average", pct=True).mul(100).round(2)
    qa = {
        "total_acecqa_services": len(points), "successfully_matched": int(points.matched_gnaf_identifier.notna().sum()),
        "exact_high_confidence_matches": int(points.match_status.eq("EXACT").sum()),
        "ambiguous_review_matches": int(points.match_status.eq("REVIEW").sum()),
        "unmatched_addresses": int(points.match_status.eq("UNMATCHED").sum()),
        "sa2_assignment_success": int(points.assigned_sa2.notna().sum()),
        "records_excluded": int((~points.included_in_spatial_analysis).sum()),
        "limitations": "Deterministic G-NAF matches only; unresolved addresses are excluded. Counts measure listed supply, not vacancies, affordability, quality, opening hours or travel time. Not for mailing-list or deliverability use.",
    }
    return pd.DataFrame(points.drop(columns="geometry")), scores, qa


def main() -> None:
    parser = argparse.ArgumentParser()
    for name in ("services", "address_detail", "geocodes", "street_locality", "locality", "boundaries", "population", "output", "scores", "qa"):
        parser.add_argument("--" + name.replace("_", "-"), dest=name, type=Path, required=True)
    args = parser.parse_args()
    records, scores, qa = geocode(args)
    for path in (args.output, args.scores, args.qa): path.parent.mkdir(parents=True, exist_ok=True)
    records.to_csv(args.output, index=False)
    scores.to_csv(args.scores, index=False)
    args.qa.write_text(json.dumps(qa, indent=2) + "\n")


if __name__ == "__main__":
    main()
