"""Deterministically match ACECQA service addresses to Open G-NAF and assign SA2."""
from __future__ import annotations

import csv
import io
import json
import re
import zipfile
from collections import defaultdict
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import Point

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw"
REF = ROOT / "data/reference"
PROC = ROOT / "data/processed"
OUT = ROOT / "outputs/iteration_2"

REPLACEMENTS = {
    "ROAD": "RD", "STREET": "ST", "AVENUE": "AVE", "DRIVE": "DR",
    "COURT": "CT", "CRESCENT": "CRES", "HIGHWAY": "HWY", "PARADE": "PDE",
    "PLACE": "PL", "BOULEVARD": "BVD", "LANE": "LANE", "TERRACE": "TCE",
    "CIRCUIT": "CCT", "CLOSE": "CL", "ESPLANADE": "ESP", "GROVE": "GR",
    "MOUNT": "MT", "SAINT": "ST", "NORTH": "N", "SOUTH": "S", "EAST": "E", "WEST": "W",
}
UNIT_PREFIX = re.compile(
    r"^(?:(?:UNIT|U|SUITE|SHOP|S|FLAT|APT|APARTMENT|LEVEL|LVL)\s*[A-Z0-9-]+(?:\s*/|\s+)|"
    r"[A-Z0-9-]+\s*/\s*)"
)


def newest(pattern: str) -> Path:
    paths = sorted(RAW.rglob(pattern))
    if not paths:
        raise FileNotFoundError(pattern)
    return paths[-1]


def normalise(value: object) -> str:
    text = str(value or "").upper().replace("&", " AND ")
    text = re.sub(r"[^A-Z0-9/-]+", " ", text)
    text = re.sub(r"\s*/\s*", "/", text).strip()
    tokens = [REPLACEMENTS.get(token, token) for token in text.split()]
    return " ".join(tokens)


def without_unit(address: str) -> str:
    previous = address
    while True:
        current = UNIT_PREFIX.sub("", previous).strip()
        if current == previous:
            return current
        previous = current


def service_address(value: object) -> str:
    """Remove a named-site prefix while retaining the actual street-address segment."""
    text = str(value or "")
    parts = [part.strip() for part in text.split(",") if part.strip()]
    street_tokens = re.compile(
        r"\b(?:RD|ROAD|ST|STREET|AVE|AVENUE|DR|DRIVE|CT|COURT|CRES|PDE|PARADE|"
        r"HWY|HIGHWAY|PL|PLACE|BVD|BOULEVARD|TCE|TERRACE|CCT|CIRCUIT|LN|LANE)\b",
        re.I,
    )
    numbered = [part for part in parts if re.search(r"\d", part) and street_tokens.search(part)]
    return normalise(numbered[-1] if numbered else parts[-1] if parts else text)


def member(zf: zipfile.ZipFile, suffix: str) -> str:
    matches = [name for name in zf.namelist() if name.endswith(suffix)]
    if len(matches) != 1:
        raise ValueError(f"Expected one {suffix}, found {len(matches)}")
    return matches[0]


def rows(zf: zipfile.ZipFile, suffix: str):
    with zf.open(member(zf, suffix)) as binary:
        text = io.TextIOWrapper(binary, encoding="utf-8-sig", newline="")
        yield from csv.DictReader(text, delimiter="|")


def active(row: dict[str, str]) -> bool:
    return not row.get("DATE_RETIRED", "").strip()


def code_names(zf: zipfile.ZipFile, filename: str) -> dict[str, str]:
    return {row["CODE"]: row["NAME"] for row in rows(zf, filename)}


def component(value: str, suffix: str = "") -> str:
    return " ".join(part for part in (value.strip(), suffix.strip()) if part)


def gnaf_address(row: dict[str, str], streets: dict, localities: dict,
                 flat_types: dict, level_types: dict) -> tuple[str, str, str, str]:
    street = streets.get(row["STREET_LOCALITY_PID"])
    locality = localities.get(row["LOCALITY_PID"])
    if not street or not locality:
        return "", "", "", ""
    flat = component(flat_types.get(row["FLAT_TYPE_CODE"], row["FLAT_TYPE_CODE"]),
                     component(row["FLAT_NUMBER_PREFIX"], component(row["FLAT_NUMBER"], row["FLAT_NUMBER_SUFFIX"])))
    level = component(level_types.get(row["LEVEL_TYPE_CODE"], row["LEVEL_TYPE_CODE"]),
                      component(row["LEVEL_NUMBER_PREFIX"], component(row["LEVEL_NUMBER"], row["LEVEL_NUMBER_SUFFIX"])))
    first = component(row["NUMBER_FIRST_PREFIX"], component(row["NUMBER_FIRST"], row["NUMBER_FIRST_SUFFIX"]))
    last = component(row["NUMBER_LAST_PREFIX"], component(row["NUMBER_LAST"], row["NUMBER_LAST_SUFFIX"]))
    number = f"{first}-{last}" if first and last else first or row["LOT_NUMBER"]
    street_text = " ".join(part for part in (street[0], street[1], street[2]) if part)
    address = " ".join(part for part in (flat, level, number, street_text) if part)
    return normalise(address), normalise(locality), row["POSTCODE"].strip(), row["ALIAS_PRINCIPAL"]


def main() -> None:
    services = pd.read_csv(newest("education_services_vic.csv"), dtype=str).fillna("")
    services["normalised_address"] = services.ServiceAddress.map(service_address)
    services["base_address"] = services.normalised_address.map(without_unit)
    services["normalised_locality"] = services.Suburb.map(normalise)
    targets_exact = defaultdict(list)
    targets_base = defaultdict(list)
    for index, row in services.iterrows():
        tail = (row.normalised_locality, row.Postcode.strip())
        targets_exact[(row.normalised_address, *tail)].append(index)
        targets_base[(row.base_address, *tail)].append(index)

    archive = newest("g-naf_aug26_allstates_gda2020_psv_110.zip")
    candidates = defaultdict(list)
    with zipfile.ZipFile(archive) as zf:
        flat_types = code_names(zf, "Authority_Code_FLAT_TYPE_AUT_psv.psv")
        level_types = code_names(zf, "Authority_Code_LEVEL_TYPE_AUT_psv.psv")
        street_types = code_names(zf, "Authority_Code_STREET_TYPE_AUT_psv.psv")
        suffixes = code_names(zf, "Authority_Code_STREET_SUFFIX_AUT_psv.psv")
        localities = {row["LOCALITY_PID"]: row["LOCALITY_NAME"] for row in rows(zf, "VIC_LOCALITY_psv.psv") if active(row)}
        streets = {
            row["STREET_LOCALITY_PID"]: (
                row["STREET_NAME"], street_types.get(row["STREET_TYPE_CODE"], row["STREET_TYPE_CODE"]),
                suffixes.get(row["STREET_SUFFIX_CODE"], row["STREET_SUFFIX_CODE"]),
            ) for row in rows(zf, "VIC_STREET_LOCALITY_psv.psv") if active(row)
        }
        for row in rows(zf, "VIC_ADDRESS_DETAIL_psv.psv"):
            if not active(row):
                continue
            address, locality, postcode, principal = gnaf_address(row, streets, localities, flat_types, level_types)
            exact_key = (address, locality, postcode)
            base_key = (without_unit(address), locality, postcode)
            matched = targets_exact.get(exact_key)
            method = "NORMALISED_FULL_ADDRESS"
            if not matched:
                matched = targets_base.get(base_key)
                method = "NORMALISED_BASE_ADDRESS"
            if matched:
                for index in matched:
                    candidates[index].append({"pid": row["ADDRESS_DETAIL_PID"], "method": method,
                                              "gnaf_address": address, "alias_principal": principal})

        candidate_pids = {item["pid"] for values in candidates.values() for item in values}
        geocodes = {}
        for row in rows(zf, "VIC_ADDRESS_DEFAULT_GEOCODE_psv.psv"):
            if active(row) and row["ADDRESS_DETAIL_PID"] in candidate_pids:
                geocodes[row["ADDRESS_DETAIL_PID"]] = (
                    row["GEOCODE_TYPE_CODE"], float(row["LONGITUDE"]), float(row["LATITUDE"])
                )

    output = []
    for index, service in services.iterrows():
        choices = []
        for candidate in candidates.get(index, []):
            if candidate["pid"] in geocodes:
                kind, longitude, latitude = geocodes[candidate["pid"]]
                choices.append({**candidate, "geocode_type": kind, "longitude": longitude, "latitude": latitude})
        precise = [choice for choice in choices if choice["geocode_type"] not in {"LOC", "STL", "UNK"}]
        coordinate_groups = {(round(item["longitude"], 7), round(item["latitude"], 7)) for item in precise}
        if len(coordinate_groups) == 1:
            preferred = sorted(precise, key=lambda item: (item["method"] != "NORMALISED_FULL_ADDRESS",
                                                           item["alias_principal"] != "P"))[0]
            match_status = ("EXACT" if len(precise) == 1 and
                            preferred["method"] == "NORMALISED_FULL_ADDRESS" else "HIGH_CONFIDENCE")
            reason = ""
        elif len(coordinate_groups) > 1:
            preferred, match_status, reason = {}, "REVIEW", "MULTIPLE_DISTINCT_GNAF_COORDINATES"
        elif choices:
            preferred, match_status, reason = {}, "REVIEW", "NO_ACCEPTABLE_PRECISE_DEFAULT_GEOCODE"
        else:
            preferred, match_status, reason = {}, "UNMATCHED", "NO_DETERMINISTIC_GNAF_MATCH"
        output.append({
            "service_approval_number": service.ServiceApprovalNumber,
            "service_name": service.ServiceName,
            "original_address": service.ServiceAddress,
            "suburb": service.Suburb,
            "postcode": service.Postcode,
            "normalised_address": service.normalised_address,
            "matched_gnaf_identifier": preferred.get("pid", ""),
            "matched_gnaf_address": preferred.get("gnaf_address", ""),
            "longitude": preferred.get("longitude"),
            "latitude": preferred.get("latitude"),
            "geocode_type": preferred.get("geocode_type", ""),
            "match_method": preferred.get("method", ""),
            "match_status": match_status,
            "candidate_count": len(choices),
            "exclusion_reason": reason,
        })

    matched = pd.DataFrame(output)
    accepted = matched.match_status.isin(["EXACT", "HIGH_CONFIDENCE"])
    points = gpd.GeoDataFrame(matched[accepted].copy(), geometry=[Point(xy) for xy in
                              zip(matched.loc[accepted, "longitude"], matched.loc[accepted, "latitude"])],
                              crs="EPSG:7844")
    boundaries = gpd.read_file(REF / "sa2_melbourne.geojson").to_crs("EPSG:7844")
    assigned = gpd.sjoin(points, boundaries[["SA2_CODE_2021", "geometry"]], predicate="within", how="left")
    matched["assigned_sa2"] = ""
    matched.loc[assigned.index, "assigned_sa2"] = assigned.SA2_CODE_2021.fillna("").astype(str)
    bridge = pd.read_csv(PROC / "community_sa2.csv", dtype={"sa2_code_2021": str})
    community = bridge.set_index("sa2_code_2021").community_id.to_dict()
    matched["assigned_kinderprint_locality"] = matched.assigned_sa2.map(community).fillna("")
    outside = accepted & matched.assigned_sa2.eq("")
    matched.loc[outside, "exclusion_reason"] = "OUTSIDE_GREATER_MELBOURNE_REPORTING_SCOPE"
    matched["included_in_spatial_analysis"] = accepted & matched.assigned_sa2.ne("")

    PROC.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    matched.to_csv(PROC / "acecqa_gnaf_geocoding.csv", index=False)
    counts = matched.match_status.value_counts().to_dict()
    report = {
        "total_acecqa_services": len(matched),
        "successfully_matched": int(accepted.sum()),
        "exact_matches": int(counts.get("EXACT", 0)),
        "high_confidence_matches": int(counts.get("HIGH_CONFIDENCE", 0)),
        "ambiguous_or_review": int(counts.get("REVIEW", 0)),
        "unmatched": int(counts.get("UNMATCHED", 0)),
        "sa2_assignment_success_greater_melbourne": int(matched.assigned_sa2.ne("").sum()),
        "records_included_in_spatial_analysis": int(matched.included_in_spatial_analysis.sum()),
        "records_excluded": int((~matched.included_in_spatial_analysis).sum()),
        "matching_source": "Open G-NAF August 2026 GDA2020",
        "policy": "Only exact/high-confidence deterministic matches within reporting scope are included.",
    }
    (OUT / "acecqa_gnaf_geocoding_qa.json").write_text(json.dumps(report, indent=2) + "\n")
    print(report)


if __name__ == "__main__":
    main()
