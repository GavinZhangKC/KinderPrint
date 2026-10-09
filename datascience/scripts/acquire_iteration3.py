"""Reproducibly acquire the six Iteration-3 care-context sources.

Each source has a fetcher (network) and a parser (pure function over the raw
payload), so the extraction logic is unit-tested offline and the live fetch is
exercised by the scheduled GitHub Action.

Sources and the reference files they produce (data/reference/iteration3/)
-------------------------------------------------------------------------
aihw_myhospitals_api_2026            myhospitals_vic_hospitals.csv,
                                     myhospitals_reported_measures.csv,
                                     myhospitals_vic_data_items.csv
aihw_phc_019_mbs_local_areas_2024_25 aihw_mbs_local_areas_vic_2024_25.csv
betterhealth_urgent_care_clinics_2026 urgent_care_clinics_vic.csv
nndss_public_datasets_2025           nndss_influenza_vic_monthly.csv,
                                     nndss_salmonella_vic_monthly.csv
osm_overpass_food_outlets_2026       osm_food_outlets_melbourne.csv
fsanz_afcd_release_3                 afcd_r3_selected_per100g.csv

Run
---
    python scripts/acquire_iteration3.py                 # fetch all, QA, write
    python scripts/acquire_iteration3.py --source fsanz_afcd_release_3
    python scripts/acquire_iteration3.py --offline       # QA + manifest only
    python scripts/acquire_iteration3.py --dry-run       # fetch + QA, write nothing

What happens per source
-----------------------
1. fetch the raw payload (retries with back-off); raw bytes are kept under
   data/raw/iteration3/<source_id>/<date>/ (git-ignored) with their SHA-256;
2. parse into the reference tables;
3. run the QA rules in iteration3_qa.py against the new tables and against the
   previous committed version (row-count drift guard);
4. compute a canonical content hash (rows sorted by key, values normalised) and,
   when it differs from the manifest, write a row-level change log
   (added / removed / changed rows with the changed columns) to
   reports/iteration3/changes/;
5. only when QA passes are the reference files replaced; a failed source keeps
   its previous files and is reported as blocked. Nothing synthetic is written.

Reconciliation against the manually captured September 2026 snapshot
---------------------------------------------------------------------
MyHospitals: reproduces all 1,580 data items exactly (value, period and
suppression) once closed reporting units are excluded. AIHW MBS: the filter
reproduces 8,316 Victorian SA3 rows and 238 national rows. The other sources
follow the same selection rules documented beside each parser.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import io
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import iteration3_qa as qa  # noqa: E402

REF = ROOT / "data" / "reference" / "iteration3"
RAW = ROOT / "data" / "raw" / "iteration3"
REPORTS = ROOT / "reports" / "iteration3"
MANIFEST = REF / "manifest.json"
USER_AGENT = "KinderPrint-data-pipeline/3.0 (+https://github.com/GavinZhangKC/KinderPrint)"


# --------------------------------------------------------------------- HTTP
class FetchError(RuntimeError):
    pass


def http_get(url: str, *, data: bytes | None = None, timeout: int = 300,
             retries: int = 3, backoff: float = 5.0) -> bytes:
    """GET (or POST when data is given) with retries; raises FetchError."""
    last: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            request = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            last = error
            if attempt < retries:
                time.sleep(backoff * attempt)
    raise FetchError(f"{url}: {type(last).__name__}: {last}")


def get_json(url: str, getter: Callable[[str], bytes], attempts: int = 3) -> dict:
    """The MyHospitals API occasionally answers a large request with an HTML error
    page; that is retried rather than parsed."""
    for attempt in range(1, attempts + 1):
        body = getter(url)
        try:
            return json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            if attempt == attempts:
                raise FetchError(f"{url} did not return JSON: {body[:80]!r}")
            time.sleep(5 * attempt if getter is http_get else 0)
    raise AssertionError("unreachable")


# ------------------------------------------------------------ MyHospitals
MYH_BASE = "https://myhospitalsapi.aihw.gov.au/api/v1/"
MYH_MEASURES = ("MYH0039", "MYH0010", "MYH0005", "MYH0036", "MYH0013", "MYH0009")
# Reported measures kept for the non-capability measures (all MYH0039 units are kept).
MYH_FIXED_REPORTED = ("MYH-RM0015",  # MYH0005 all patients
                      "MYH-RM0035", "MYH-RM0036", "MYH-RM0037", "MYH-RM0038", "MYH-RM0039",  # MYH0010 triage
                      "MYH-RM0040", "MYH-RM0041", "MYH-RM0042",  # MYH0009 urgency
                      "MYH-RM0300",  # MYH0036 median time in ED
                      "MYH-RM0302")  # MYH0013 90th percentile
MYH_STATE = "Vic"


def myh_select_reported(reported: list[dict]) -> list[dict]:
    keep = []
    for item in reported:
        code = item["reported_measure_code"]
        measure = item["measure"]["measure_code"]
        if code in MYH_FIXED_REPORTED or measure == "MYH0039":
            keep.append(item)
    return sorted(keep, key=lambda item: item["reported_measure_code"])


def myh_parse_units(units: list[dict]) -> pd.DataFrame:
    rows = []
    for unit in units:
        mapped = unit.get("mapped_reporting_units") or []
        state = next((m["mapped_reporting_unit"]["reporting_unit_code"] for m in mapped
                      if m["map_type"]["mapped_reporting_unit_code"] == "STATE_MAPPING"), None)
        if state != MYH_STATE:
            continue
        lhn = next((m["mapped_reporting_unit"]["reporting_unit_name"] for m in mapped
                    if m["map_type"]["mapped_reporting_unit_code"] == "H_LHN"), "")
        rows.append({
            "code": unit["reporting_unit_code"], "name": unit["reporting_unit_name"],
            "private": int(bool(unit.get("private"))), "closed": int(bool(unit.get("closed"))),
            "latitude": unit.get("latitude"), "longitude": unit.get("longitude"),
            "lhn": lhn, "alternative_names": "; ".join(unit.get("alternative_names") or []),
        })
    return pd.DataFrame(rows, columns=["code", "name", "private", "closed", "latitude",
                                       "longitude", "lhn", "alternative_names"])


def myh_parse_reported(reported: list[dict]) -> pd.DataFrame:
    rows = [{
        "reported_measure_code": item["reported_measure_code"],
        "measure_code": item["measure"]["measure_code"],
        "measure_name": item["measure"]["measure_name"],
        "reported_measure_name": item["reported_measure_name"],
        "units": ((item["measure"].get("units") or {}).get("units_display") or ""),
    } for item in myh_select_reported(reported)]
    return pd.DataFrame(rows, columns=["reported_measure_code", "measure_code", "measure_name",
                                       "reported_measure_name", "units"])


def myh_parse_items(items: list[dict], datasets: dict[int, dict], hospitals: pd.DataFrame) -> pd.DataFrame:
    """Latest reporting period per open Victorian unit x reported measure."""
    open_units = set(hospitals.loc[hospitals.closed == 0, "code"]) | {MYH_STATE}
    latest: dict[tuple[str, str], dict] = {}
    for item in items:
        code = item["reporting_unit_summary"]["reporting_unit_code"]
        if code not in open_units:
            continue
        dataset = datasets[item["data_set_id"]]
        row = {
            "code": code, "reported_measure_code": item["reported_measure_code"],
            "value": item.get("value"),
            "start": dataset["reporting_start_date"], "end": dataset["reporting_end_date"],
            "suppressions": ";".join(s["suppression_code"] for s in item.get("suppressions") or []),
            "peer_group": ((item.get("peer_group_summary") or {}).get("reporting_unit_name") or ""),
        }
        key = (code, row["reported_measure_code"])
        if key not in latest or row["end"] > latest[key]["end"]:
            latest[key] = row
    frame = pd.DataFrame(latest.values(), columns=["code", "reported_measure_code", "value", "start",
                                                    "end", "suppressions", "peer_group"])
    return frame.sort_values(["code", "reported_measure_code"]).reset_index(drop=True)


def fetch_myhospitals(getter, raw_dir: Path) -> dict[str, pd.DataFrame]:
    units = get_json(MYH_BASE + "reporting-units", getter)["result"]
    reported = get_json(MYH_BASE + "reported-measures", getter)["result"]
    datasets = {d["data_set_id"]: d for d in get_json(MYH_BASE + "datasets", getter)["result"]}
    hospitals = myh_parse_units(units)
    selected = myh_select_reported(reported)
    items: list[dict] = []
    for item in selected:
        code = item["reported_measure_code"]
        items.extend(get_json(f"{MYH_BASE}reported-measures/{code}/data-items", getter)["result"])
    _save_raw(raw_dir, "myhospitals_payload.json", json.dumps(
        {"units": len(units), "reported": [i["reported_measure_code"] for i in selected],
         "data_items": len(items)}).encode())
    return {
        "myhospitals_vic_hospitals.csv": hospitals,
        "myhospitals_reported_measures.csv": myh_parse_reported(reported),
        "myhospitals_vic_data_items.csv": myh_parse_items(items, datasets, hospitals),
    }


# ------------------------------------------------------------- AIHW MBS
MBS_PAGE = "https://www.aihw.gov.au/reports/primary-health-care/medicare-subsidised-gp-allied-health-specialist/data"
MBS_YEAR = "2024-25"
MBS_SERVICES = (
    "GP attendances (total)", "Specialist attendances (total)",
    "Allied Health subtotal - Mental Health Care", "Allied Health subtotal - Optometry",
    "Audiology", "Clinical Psychologist", "Dietetics", "Early Intervention Services for Children",
    "GP After-hours (non-urgent)", "GP After-hours (urgent)", "Nurse Practitioners",
    "Occupational Therapy", "Other Psychologist", "Physiotherapy", "Psychiatry", "Speech Pathology",
)
MBS_MEASURES = (
    "Estimated resident population", "No. patients", "No. services",
    "Percentage of people who had the service (%)", "Services per 100 people",
    "Total Medicare benefits paid ($)", "Total provider fees ($)",
)
MBS_DEMOGRAPHICS = ("All persons", "0-24")


def mbs_find_zip(page_html: str, year: str = MBS_YEAR) -> str:
    """Return the CSV zip whose file range contains the configured year."""
    yy = year[2:4] + year[5:7]  # 2024-25 -> 2425
    links = re.findall(r'href="([^"]*aihw-phc-019-csv-file-(\d{4})-(\d{4})\.zip)"', page_html)
    for href, first, last in links:
        if yy in (first, last):
            return urllib.parse.urljoin(MBS_PAGE, html.unescape(href))
    raise FetchError(f"no aihw-phc-019 CSV zip containing {year} on {MBS_PAGE}")


def _clean_number(value: str) -> str:
    return value.replace("$", "").replace(",", "").replace("%", "").strip()


def mbs_parse(zip_bytes: bytes, year: str = MBS_YEAR) -> pd.DataFrame:
    yy = year[2:4] + year[5:7]
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        name = next(n for n in archive.namelist() if n.endswith(f"_{yy}.csv") or n.endswith(f"-{yy}.csv"))
        text = archive.read(name).decode("utf-8-sig")
    rows = []
    for record in csv.DictReader(io.StringIO(text)):
        unit = record["GeographicUnit"]
        keep_area = (unit == "SA3" and record["StateTerritory"] == "Vic") or unit == "National"
        if not (keep_area and record["Year"] == year and record["Service"] in MBS_SERVICES
                and record["MeasureName"] in MBS_MEASURES and record["DemographicGroup"] in MBS_DEMOGRAPHICS):
            continue
        rows.append({"unit": unit, "code": record["GeographicCode"], "name": record["GeographicAreaName"],
                     "service": record["Service"], "measure": record["MeasureName"],
                     "demographic": record["DemographicGroup"],
                     "value": _clean_number(record["MeasureValue"]) if record["MeasureValue"] != "n.p." else "",
                     "flag": record.get("Flag", "") or ""})
    frame = pd.DataFrame(rows, columns=["unit", "code", "name", "service", "measure", "demographic", "value", "flag"])
    # National rows are published in both Table 2 and Table 3 with identical values.
    frame = frame.drop_duplicates().reset_index(drop=True)
    frame.loc[frame.value.eq("") & frame.flag.eq(""), "flag"] = "n.p."
    return frame


def fetch_mbs(getter, raw_dir: Path) -> dict[str, pd.DataFrame]:
    url = mbs_find_zip(getter(MBS_PAGE).decode("utf-8", "replace"))
    payload = getter(url)
    _save_raw(raw_dir, Path(urllib.parse.urlparse(url).path).name, payload)
    return {"aihw_mbs_local_areas_vic_2024_25.csv": mbs_parse(payload)}


# ------------------------------------------------------ Urgent care clinics
UCC_FEED = "https://www.betterhealth.vic.gov.au/map-data?pid=29639"


def _strip_tags(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", value or "")).strip()


def ucc_parse(feed: dict) -> pd.DataFrame:
    rows = []
    for record in feed["records"]:
        link = re.search(r'href="([^"]+)"', record.get("openingHours") or "")
        rows.append({
            "name": _strip_tags(record.get("venue")), "address": _strip_tags(record.get("address")),
            "suburb_postcode": _strip_tags(record.get("suburb")),
            "phone": _strip_tags(record.get("additionalDetails")),
            "listing_url": html.unescape(link.group(1)) if link else "",
            "latitude": float(record["latitude"]), "longitude": float(record["longitude"]),
        })
    return pd.DataFrame(rows, columns=["name", "address", "suburb_postcode", "phone", "listing_url",
                                       "latitude", "longitude"])


def fetch_ucc(getter, raw_dir: Path) -> dict[str, pd.DataFrame]:
    payload = getter(UCC_FEED)
    _save_raw(raw_dir, "ucc_map_data.json", payload)
    return {"urgent_care_clinics_vic.csv": ucc_parse(json.loads(payload))}


# ------------------------------------------------------------------ NNDSS
NNDSS_PAGES = {
    "influenza": "https://www.cdc.gov.au/resources/publications/nndss-dataset-influenza",
    "salmonella": "https://www.cdc.gov.au/resources/publications/nndss-dataset-salmonella",
}


def nndss_find_xlsx(page_html: str, page_url: str) -> str:
    match = re.search(r'href="([^"]+\.xlsx)"', page_html)
    if not match:
        raise FetchError(f"no xlsx link on {page_url}")
    return urllib.parse.urljoin(page_url, html.unescape(match.group(1)))


def _find_column(columns, *needles) -> str:
    for column in columns:
        label = re.sub(r"\s+", " ", str(column)).strip().lower()
        if all(n in label for n in needles):
            return column
    raise KeyError(f"no column containing {needles} in {list(columns)}")


def nndss_parse(xlsx: bytes | Path, state: str = "Vic") -> pd.DataFrame:
    """Count record-level notifications by week-ending month x age group for one state.

    Every sheet in the workbook is a year block with a title row then a header row.
    """
    frames = []
    book = pd.read_excel(xlsx if isinstance(xlsx, Path) else io.BytesIO(xlsx), sheet_name=None,
                         header=None, dtype=object, engine="openpyxl")
    for sheet in book.values():
        header_row = next(i for i in range(min(10, len(sheet)))
                          if any("week ending" in str(v).lower() for v in sheet.iloc[i].values))
        data = sheet.iloc[header_row + 1:].copy()
        data.columns = sheet.iloc[header_row].values
        week = _find_column(data.columns, "week ending")
        state_col = _find_column(data.columns, "state")
        age = _find_column(data.columns, "age")
        data = data[data[state_col].astype(str).str.strip() == state]
        dates = pd.to_datetime(data[week], errors="coerce")
        numeric = pd.to_numeric(data[week], errors="coerce")
        dates = dates.where(dates.notna(), pd.to_datetime(numeric, unit="D", origin="1899-12-30"))
        frames.append(pd.DataFrame({"year_month": dates.dt.strftime("%Y-%m"),
                                    "age_group": data[age].where(data[age].notna(), None)}))
    records = pd.concat(frames, ignore_index=True).dropna(subset=["year_month"])
    # A blank age group is kept (written as an empty cell) so monthly totals stay complete.
    records["age_group"] = records["age_group"].map(lambda v: "" if v is None or str(v).strip() in ("", "nan", "None") else str(v).strip())
    counts = records.groupby(["year_month", "age_group"]).size().rename("notifications").reset_index()
    return counts.sort_values(["year_month", "age_group"]).reset_index(drop=True)


def fetch_nndss(getter, raw_dir: Path) -> dict[str, pd.DataFrame]:
    out = {}
    for disease, page in NNDSS_PAGES.items():
        url = nndss_find_xlsx(getter(page).decode("utf-8", "replace"), page)
        payload = getter(url)
        _save_raw(raw_dir, Path(urllib.parse.urlparse(url).path).name, payload)
        out[f"nndss_{disease}_vic_monthly.csv"] = nndss_parse(payload)
    return out


# -------------------------------------------------------------- Overpass
OVERPASS = "https://overpass-api.de/api/interpreter"
OSM_SHOPS = ("supermarket", "greengrocer", "butcher", "bakery", "deli", "seafood", "health_food", "farm")


def osm_query(bbox: tuple[float, float, float, float]) -> str:
    south, west, north, east = bbox
    box = f"({south},{west},{north},{east})"
    return (f'[out:json][timeout:240];('
            f'nwr["shop"~"^({"|".join(OSM_SHOPS)})$"]{box};'
            f'nwr["amenity"="marketplace"]{box};'
            f'nwr["organic"~"^(yes|only)$"]{box};'
            f');out center tags;')


def osm_bbox(geojson_path: Path = ROOT / "data" / "reference" / "sa2_melbourne.geojson") -> tuple[float, float, float, float]:
    geo = json.loads(geojson_path.read_text())
    xs, ys = [], []

    def walk(coords):
        if isinstance(coords[0], (int, float)):
            xs.append(coords[0]); ys.append(coords[1])
        else:
            for c in coords:
                walk(c)
    for feature in geo["features"]:
        walk(feature["geometry"]["coordinates"])
    return (round(min(ys), 4), round(min(xs), 4), round(max(ys), 4), round(max(xs), 4))


def osm_parse(payload: dict, geojson_path: Path | None = None) -> pd.DataFrame:
    rows = []
    for element in payload.get("elements", []):
        tags = element.get("tags") or {}
        lat = element.get("lat", (element.get("center") or {}).get("lat"))
        lon = element.get("lon", (element.get("center") or {}).get("lon"))
        if lat is None or lon is None:
            continue
        address = " ".join(p for p in (tags.get("addr:housenumber"), tags.get("addr:street")) if p)
        rows.append({"osm_id": f"{element['type']}/{element['id']}", "name": tags.get("name", ""),
                     "shop": tags.get("shop", ""), "amenity": tags.get("amenity", ""),
                     "organic": tags.get("organic", ""), "brand": tags.get("brand", ""),
                     "address": address, "opening_hours": tags.get("opening_hours", ""),
                     "latitude": lat, "longitude": lon})
    frame = pd.DataFrame(rows, columns=["osm_id", "name", "shop", "amenity", "organic", "brand",
                                        "address", "opening_hours", "latitude", "longitude"])
    frame = frame.drop_duplicates("osm_id")
    if geojson_path is not None and len(frame):
        frame = _within_polygons(frame, geojson_path)
    return frame.sort_values("osm_id").reset_index(drop=True)


def _within_polygons(frame: pd.DataFrame, geojson_path: Path) -> pd.DataFrame:
    import geopandas as gpd
    areas = gpd.read_file(geojson_path)[["geometry"]]
    points = gpd.GeoDataFrame(frame, geometry=gpd.points_from_xy(frame.longitude, frame.latitude), crs=areas.crs or "EPSG:4326")
    joined = gpd.sjoin(points, areas.to_crs(points.crs), how="inner", predicate="within")
    return frame.loc[sorted(set(joined.index))]


def fetch_osm(getter, raw_dir: Path) -> dict[str, pd.DataFrame]:
    geojson = ROOT / "data" / "reference" / "sa2_melbourne.geojson"
    query = osm_query(osm_bbox(geojson))
    payload = getter(OVERPASS, data=urllib.parse.urlencode({"data": query}).encode())
    _save_raw(raw_dir, "overpass_food_outlets.json", payload)
    return {"osm_food_outlets_melbourne.csv": osm_parse(json.loads(payload), geojson)}


# ------------------------------------------------------------------ AFCD
AFCD_PAGE = "https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/data-files"
AFCD_SHEET = "All solids & liquids per 100 g"
AFCD_COLUMNS = (
    "Public Food Key", "Classification", "Food Name",
    "Energy with dietary fibre, equated (kJ)", "Protein (g)", "Fat, total (g)", "Total dietary fibre (g)",
    "Total sugars (g)", "Added sugars (g)", "Calcium (Ca) (mg)", "Iodine (I) (ug)", "Iron (Fe) (mg)",
    "Magnesium (Mg) (mg)", "Potassium (K) (mg)", "Sodium (Na) (mg)", "Zinc (Zn) (mg)",
    "Vitamin A retinol equivalents (ug)", "Dietary folate equivalents (ug)", "Vitamin C (mg)",
    "Vitamin D3 equivalents (ug)", "Total long chain omega 3 fatty acids, equated (%T)",
    "Total long chain omega 3 fatty acids, equated (mg)",
)


def afcd_find_xlsx(page_html: str) -> str:
    match = re.search(r'href="([^"]*Nutrient%20profiles\.xlsx|[^"]*Nutrient profiles\.xlsx)"', page_html)
    if not match:
        raise FetchError(f"no AFCD nutrient profiles xlsx on {AFCD_PAGE}")
    return urllib.parse.urljoin(AFCD_PAGE, html.unescape(match.group(1)).replace(" ", "%20"))


def afcd_parse(xlsx: bytes | Path) -> pd.DataFrame:
    sheet = pd.read_excel(xlsx if isinstance(xlsx, Path) else io.BytesIO(xlsx), sheet_name=AFCD_SHEET,
                          header=None, dtype=object, engine="openpyxl")
    header_row = next(i for i in range(10) if str(sheet.iloc[i, 0]).strip() == "Public Food Key")
    data = sheet.iloc[header_row + 1:].copy()
    data.columns = [re.sub(r"\s+", " ", str(c)).strip() for c in sheet.iloc[header_row].values]
    data = data.loc[:, ~pd.Index(data.columns).duplicated()]
    missing = [c for c in AFCD_COLUMNS if c not in data.columns]
    if missing:
        raise KeyError(f"AFCD columns not found: {missing}")
    data = data[list(AFCD_COLUMNS)].dropna(subset=["Public Food Key"])
    data["Classification"] = data["Classification"].map(lambda v: str(int(v)) if isinstance(v, (int, float)) else str(v))
    return data.reset_index(drop=True)


def fetch_afcd(getter, raw_dir: Path) -> dict[str, pd.DataFrame]:
    url = afcd_find_xlsx(getter(AFCD_PAGE).decode("utf-8", "replace"))
    payload = getter(url)
    _save_raw(raw_dir, "AFCD_Release_3_Nutrient_profiles.xlsx", payload)
    return {"afcd_r3_selected_per100g.csv": afcd_parse(payload)}


# -------------------------------------------------------------- registry
@dataclass
class Source:
    source_id: str
    url: str
    fetch: Callable
    outputs: tuple[str, ...]
    notes: str = ""
    extra: dict = field(default_factory=dict)


SOURCES: dict[str, Source] = {s.source_id: s for s in (
    Source("aihw_myhospitals_api_2026", MYH_BASE, fetch_myhospitals,
           ("myhospitals_vic_hospitals.csv", "myhospitals_reported_measures.csv", "myhospitals_vic_data_items.csv")),
    Source("aihw_phc_019_mbs_local_areas_2024_25", MBS_PAGE, fetch_mbs, ("aihw_mbs_local_areas_vic_2024_25.csv",)),
    Source("betterhealth_urgent_care_clinics_2026", UCC_FEED, fetch_ucc, ("urgent_care_clinics_vic.csv",)),
    Source("nndss_public_datasets_2025", "https://www.cdc.gov.au/resources/collections/nndss-public-datasets",
           fetch_nndss, ("nndss_influenza_vic_monthly.csv", "nndss_salmonella_vic_monthly.csv")),
    Source("osm_overpass_food_outlets_2026", OVERPASS, fetch_osm, ("osm_food_outlets_melbourne.csv",)),
    Source("fsanz_afcd_release_3", AFCD_PAGE, fetch_afcd, ("afcd_r3_selected_per100g.csv",)),
)}


# ------------------------------------------------ hashing and change logs
def _save_raw(raw_dir: Path, name: str, payload: bytes) -> None:
    raw_dir.mkdir(parents=True, exist_ok=True)
    (raw_dir / name).write_bytes(payload)


def _normalise(frame: pd.DataFrame) -> pd.DataFrame:
    """String form used for hashing and diffs: numbers rounded to 6 significant digits."""
    def cell(value):
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return ""
        text = str(value).strip()
        try:
            number = float(re.sub(r"[$,%]", "", text)) if re.fullmatch(r"-?\$?[\d,]*\.?\d+%?", text) else float("x")
        except ValueError:
            return "" if text.lower() == "nan" else text
        return f"{number:.6g}"
    return frame.astype(object).apply(lambda column: column.map(cell))


def canonical_hash(frame: pd.DataFrame, keys: list[str]) -> str:
    norm = _normalise(frame)
    norm = norm.sort_values(keys + [c for c in norm.columns if c not in keys]).reset_index(drop=True)
    return hashlib.sha256(norm.to_csv(index=False, lineterminator="\n").encode()).hexdigest()


def diff_tables(old: pd.DataFrame, new: pd.DataFrame, keys: list[str]) -> pd.DataFrame:
    """Row-level change log: change in {added, removed, changed} plus changed columns."""
    old_n, new_n = _normalise(old), _normalise(new)
    merged = old_n.merge(new_n, on=keys, how="outer", suffixes=("__old", "__new"), indicator=True)
    compare = [c for c in new_n.columns if c not in keys and c in old_n.columns]
    records = []
    for _, row in merged.iterrows():
        key = {k: row[k] for k in keys}
        if row["_merge"] == "left_only":
            records.append({**key, "change": "removed", "columns": "", "old": "", "new": ""})
        elif row["_merge"] == "right_only":
            records.append({**key, "change": "added", "columns": "", "old": "", "new": ""})
        else:
            changed = [c for c in compare if row[f"{c}__old"] != row[f"{c}__new"]]
            if changed:
                records.append({**key, "change": "changed", "columns": ";".join(changed),
                                "old": json.dumps({c: row[f"{c}__old"] for c in changed}),
                                "new": json.dumps({c: row[f"{c}__new"] for c in changed})})
    return pd.DataFrame(records, columns=keys + ["change", "columns", "old", "new"])


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_reference(name: str) -> pd.DataFrame:
    return pd.read_csv(REF / name, dtype=str, keep_default_na=False)


def load_manifest() -> dict:
    return json.loads(MANIFEST.read_text()) if MANIFEST.is_file() else {"files": {}, "runs": []}


def register_capture(source_id: str) -> str:
    """Capture date recorded in the source register, as a manifest timestamp."""
    register = ROOT / "config" / "data_source_register.csv"
    for row in csv.DictReader(register.open()):
        if row["source_id"] == source_id and re.fullmatch(r"\d{4}-\d{2}-\d{2}", row["download_date"]):
            return row["download_date"] + "T000000Z"
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")


def manifest_entry(source: Source, name: str, frame: pd.DataFrame, status: str, acquired: str) -> dict:
    spec = qa.SPECS[name]
    return {"source_id": source.source_id, "source_url": source.url, "status": status,
            "acquired_utc": acquired, "rows": int(len(frame)), "columns": list(frame.columns),
            "file_sha256": file_sha256(REF / name) if (REF / name).is_file() else None,
            "content_sha256": canonical_hash(frame, spec.keys)}


# ------------------------------------------------------------------ main
def run(selected: list[str], *, offline: bool, dry_run: bool, getter=http_get,
        stamp: str | None = None) -> dict:
    stamp = stamp or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
    day = stamp[:10]
    manifest = load_manifest()
    summary = {"run_utc": stamp, "mode": "offline" if offline else ("dry-run" if dry_run else "live"),
               "sources": {}}
    (REPORTS / "changes").mkdir(parents=True, exist_ok=True)
    for source_id in selected:
        source = SOURCES[source_id]
        result = {"status": None, "files": {}}
        try:
            if offline:
                tables = {name: read_reference(name) for name in source.outputs}
            else:
                tables = source.fetch(getter, RAW / source_id / day)
        except Exception as error:  # a blocked source keeps its previous files
            result.update(status="blocked", error=f"{type(error).__name__}: {error}")
            summary["sources"][source_id] = result
            continue
        all_ok = True
        for name, frame in tables.items():
            spec = qa.SPECS[name]
            previous = read_reference(name) if (REF / name).is_file() else None
            report = qa.check(name, frame, previous)
            (REPORTS / f"qa_{name.removesuffix('.csv')}.json").write_text(json.dumps(report, indent=2))
            entry = {"rows": len(frame), "qa_passed": report["passed"], "warnings": report["warnings"],
                     "failed_rules": [r["rule"] for r in report["rules"]
                                      if not r["passed"] and r.get("severity") == "error"]}
            new_hash = canonical_hash(frame, spec.keys)
            old_hash = manifest["files"].get(name, {}).get("content_sha256")
            entry["changed"] = old_hash is not None and new_hash != old_hash
            if previous is not None and new_hash != canonical_hash(previous, spec.keys):
                log = diff_tables(previous, frame, spec.keys)
                entry["change_counts"] = log["change"].value_counts().to_dict()
                if not dry_run:
                    log.to_csv(REPORTS / "changes" / f"{day}_{name}", index=False)
            all_ok &= report["passed"]
            result["files"][name] = entry
        if all_ok and not dry_run:
            for name, frame in tables.items():
                if not offline:
                    frame.to_csv(REF / name, index=False)
                acquired = stamp
                if offline:  # verification does not make data fresher: keep the capture time
                    acquired = manifest["files"].get(name, {}).get("acquired_utc") or register_capture(source.source_id)
                manifest["files"][name] = manifest_entry(source, name, frame,
                                                         "offline-verified" if offline else "acquired", acquired)
                manifest["files"][name]["verified_utc"] = stamp
        result["status"] = "ok" if all_ok else "qa_failed"
        summary["sources"][source_id] = result
    if not dry_run:
        manifest["runs"] = (manifest.get("runs", []) + [{
            "run_utc": stamp, "mode": summary["mode"],
            "status": {k: v["status"] for k, v in summary["sources"].items()}}])[-50:]
        manifest["pipeline"] = "acquire_iteration3.py"
        MANIFEST.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
        (REPORTS / "acquire_summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--source", action="append", choices=sorted(SOURCES), help="repeatable; default all")
    parser.add_argument("--offline", action="store_true", help="validate committed files; no network")
    parser.add_argument("--dry-run", action="store_true", help="fetch and QA but write nothing")
    args = parser.parse_args(argv)
    summary = run(args.source or list(SOURCES), offline=args.offline, dry_run=args.dry_run)
    print(json.dumps(summary, indent=2))
    return 0 if all(s["status"] == "ok" for s in summary["sources"].values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
