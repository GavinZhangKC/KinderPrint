"""Offline tests for the Iteration-3 acquisition pipeline.

Fixtures copy the exact shapes returned by each live source (captured
30 Sep 2026), so the parsers are tested without the network.
"""
import io
import json
import sys
import zipfile
from datetime import datetime
from pathlib import Path

import openpyxl
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import acquire_iteration3 as acq  # noqa: E402
import iteration3_qa as qa  # noqa: E402


# ---------------------------------------------------------------- MyHospitals
def _unit(code, name, state="Vic", unit_type="H", closed=False, lhn="Western District Health Service (Vic)"):
    mapped = [{"mapped_reporting_unit": {"reporting_unit_code": state, "reporting_unit_name": state,
                                         "reporting_unit_type": {"reporting_unit_type_code": "S"}},
               "map_type": {"mapped_reporting_unit_code": "STATE_MAPPING"}}]
    if lhn:
        mapped.insert(0, {"mapped_reporting_unit": {"reporting_unit_code": "LHN282", "reporting_unit_name": lhn},
                          "map_type": {"mapped_reporting_unit_code": "H_LHN"}})
    return {"reporting_unit_code": code, "reporting_unit_name": name, "private": False, "closed": closed,
            "latitude": -37.736495, "longitude": 142.030606, "alternative_names": ["WDHS", "Western District [Hamilton]"],
            "mapped_reporting_units": mapped, "reporting_unit_type": {"reporting_unit_type_code": unit_type}}


def _item(code, rm, data_set_id, value, suppressions=()):
    return {"reporting_unit_summary": {"reporting_unit_code": code}, "reported_measure_code": rm,
            "data_set_id": data_set_id, "value": value, "caveats": [],
            "suppressions": [{"suppression_code": s} for s in suppressions],
            "peer_group_summary": {"reporting_unit_name": "Small hospitals"}}


def test_myhospitals_units_keep_victoria_with_lhn_and_flags():
    units = [_unit("H0233", "Western District Health Service [Hamilton]"),
             _unit("H0041", "Bulli Hospital", state="NSW"),
             _unit("LHN203", "Ballarat Health Services", unit_type="LHN", closed=True, lhn=None)]
    frame = acq.myh_parse_units(units)
    assert frame.code.tolist() == ["H0233", "LHN203"]
    first = frame.iloc[0]
    assert first.lhn == "Western District Health Service (Vic)"
    assert first.alternative_names == "WDHS; Western District [Hamilton]"
    assert (first.private, first.closed) == (0, 0)
    assert frame.iloc[1].closed == 1


def test_myhospitals_items_take_latest_period_and_drop_closed_units():
    hospitals = acq.myh_parse_units([_unit("H0233", "A"), _unit("LHN203", "Closed", closed=True, lhn=None)])
    datasets = {1: {"reporting_start_date": "2017-07-01", "reporting_end_date": "2018-06-30"},
                2: {"reporting_start_date": "2024-07-01", "reporting_end_date": "2025-06-30"}}
    items = [_item("H0233", "MYH-RM0015", 1, 70), _item("H0233", "MYH-RM0015", 2, 81),
             _item("H0233", "MYH-RM0040", 2, None, ["X40"]), _item("LHN203", "MYH-RM0015", 2, 46),
             _item("H9999", "MYH-RM0015", 2, 50)]
    frame = acq.myh_parse_items(items, datasets, hospitals)
    assert len(frame) == 2
    latest = frame.set_index("reported_measure_code")
    assert latest.loc["MYH-RM0015", "value"] == 81 and latest.loc["MYH-RM0015", "end"] == "2025-06-30"
    assert latest.loc["MYH-RM0040", "suppressions"] == "X40"


def test_myhospitals_reported_selection_is_pinned_plus_all_capability_units():
    def rm(code, measure, units=None):
        return {"reported_measure_code": code, "reported_measure_name": code,
                "measure": {"measure_code": measure, "measure_name": measure, "units": units}}
    reported = [rm("MYH-RM0016", "MYH0005"), rm("MYH-RM0015", "MYH0005", {"units_display": "%"}),
                rm("MYH-RM0762", "MYH0039"), rm("MYH-RM0300", "MYH0036", {"units_display": None})]
    frame = acq.myh_parse_reported(reported)
    assert frame.reported_measure_code.tolist() == ["MYH-RM0015", "MYH-RM0300", "MYH-RM0762"]
    assert frame.units.tolist() == ["%", "", ""]


def test_get_json_retries_an_html_error_page():
    calls = iter([b"<!DOCTYPE html><html>busy</html>", b'{"result": [1]}'])
    assert acq.get_json("https://example.test", lambda url: next(calls))["result"] == [1]


# ----------------------------------------------------------------- AIHW MBS
MBS_HEADER = ("Code,DataSource,Name,Worksheet,Year,StateTerritory,GeographicUnit,GeographicCode,GeographicAreaName,"
              "GeographicGroup,ServiceLevel,Service,MeasureName,DemographicGroup,MeasureValue,Flag,FlagExplanation")


def _mbs_row(table, state, unit, code, name, service, measure, demographic, value, flag=""):
    return (f'MBS,Medicare Benefits Schedule,"Medicare-subsidised GP",{table},2024-25,{state},{unit},{code},{name},'
            f'group,Level 1,{service},{measure},{demographic},"{value}",{flag},')


def _mbs_zip():
    rows = [MBS_HEADER,
            _mbs_row("Table 3", "Vic", "SA3", "20601", "Brunswick - Coburg", "GP attendances (total)", "No. patients", "0-24", "16,304"),
            _mbs_row("Table 3", "Vic", "SA3", "20601", "Brunswick - Coburg", "GP attendances (total)", "Total provider fees ($)", "0-24", "$5,498,016"),
            _mbs_row("Table 3", "Vic", "SA3", "20601", "Brunswick - Coburg", "GP attendances (total)", "Percentage of people who had the service (%)", "0-24", "69.26%"),
            _mbs_row("Table 3", "Vic", "SA3", "20601", "Brunswick - Coburg", "Audiology", "No. patients", "0-24", "n.p.", "n.p."),
            _mbs_row("Table 3", "Vic", "SA3", "20601", "Brunswick - Coburg", "GP attendances (total)", "No. patients", "15-24", "9,000"),
            _mbs_row("Table 3", "NSW", "SA3", "10102", "Queanbeyan", "GP attendances (total)", "No. patients", "0-24", "1"),
            _mbs_row("Table 2", "National", "National", "001NAT", "National", "GP attendances (total)", "No. patients", "All persons", "22,778,981"),
            _mbs_row("Table 3", "National", "National", "001NAT", "National", "GP attendances (total)", "No. patients", "All persons", "22,778,981")]
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("aihw-phc-19-csv_file_2425.csv", "\r\n".join(rows) + "\r\n")
        archive.writestr("aihw-phc-19-csv_file_2324.csv", MBS_HEADER + "\r\n")
    return buffer.getvalue()


def test_mbs_parse_filters_victoria_and_national_and_cleans_numbers():
    frame = acq.mbs_parse(_mbs_zip())
    assert len(frame) == 5  # 4 Victorian rows + 1 de-duplicated national row
    assert set(frame.unit) == {"SA3", "National"}
    values = frame.set_index(["code", "measure", "service"]).value
    assert values[("20601", "No. patients", "GP attendances (total)")] == "16304"
    assert values[("20601", "Total provider fees ($)", "GP attendances (total)")] == "5498016"
    assert values[("20601", "Percentage of people who had the service (%)", "GP attendances (total)")] == "69.26"
    audiology = frame[frame.service == "Audiology"].iloc[0]
    assert (audiology.value, audiology.flag) == ("", "n.p.")


def test_mbs_zip_link_is_found_for_configured_year():
    page = ('<a href="/getmedia/ecb/aihw-phc-019-csv-file-2122-2223.zip">x</a>'
            '<a href="https://www.aihw.gov.au/getmedia/a39/aihw-phc-019-csv-file-2324-2425.zip">y</a>')
    assert acq.mbs_find_zip(page).endswith("aihw-phc-019-csv-file-2324-2425.zip")
    with pytest.raises(acq.FetchError):
        acq.mbs_find_zip(page, "2026-27")


# ------------------------------------------------------ urgent care clinics
def test_ucc_parse_reads_the_better_health_map_feed():
    feed = {"records": [{
        "venue": "Ballarat Medicare Urgent Care Clinic", "address": "Level 1, 1010 Sturt Street",
        "suburb": "Ballarat Central 3350", "additionalDetails": '<a href="Tel:0343200820">03 4320 0820</a> ',
        "openingHours": '<a href="https://www.healthdirect.gov.au/x/urgent-care/b34f">listing</a>',
        "latitude": "-37.5599986", "longitude": "143.8452481"}]}
    row = acq.ucc_parse(feed).iloc[0]
    assert row.phone == "03 4320 0820"
    assert row.listing_url == "https://www.healthdirect.gov.au/x/urgent-care/b34f"
    assert row.latitude == pytest.approx(-37.5599986)


# --------------------------------------------------------------------- NNDSS
def _nndss_workbook(path):
    book = openpyxl.Workbook()
    book.remove(book.active)
    for sheet_name, rows in {"2016-2018": [(datetime(2016, 1, 1), "Vic", "00-04"), (datetime(2016, 1, 8), "Vic", "00-04"),
                                           (datetime(2016, 1, 8), "NSW", "00-04"), (datetime(2016, 2, 5), "Vic", None)],
                             "2022-2024": [(datetime(2024, 12, 27), "Vic", "05-09"), (datetime(2025, 1, 3), "Vic", "05-09")]}.items():
        sheet = book.create_sheet(sheet_name)
        sheet.append(["Influenza (laboratory confirmed) NNDSS notifications in Australia"])
        sheet.append(["Week Ending (Friday)", "State", "Age  group", "Sex", "Indigenous status", "Type/Subtype"])
        for week, state, age in rows:
            sheet.append([week, state, age, "MALE", "Unknown", "B"])
    book.save(path)


def test_nndss_counts_victorian_records_by_week_ending_month(tmp_path):
    path = tmp_path / "flu.xlsx"
    _nndss_workbook(path)
    frame = acq.nndss_parse(path)
    got = {(r.year_month, r.age_group): r.notifications for r in frame.itertuples()}
    assert got[("2016-01", "00-04")] == 2           # NSW row excluded
    assert got[("2016-02", "")] == 1              # blank age kept as missing, not dropped
    assert got[("2024-12", "05-09")] == 1 and got[("2025-01", "05-09")] == 1
    assert frame.notifications.sum() == 5


# ---------------------------------------------------------------------- AFCD
def test_afcd_parse_normalises_multiline_headers(tmp_path):
    book = openpyxl.Workbook()
    book.active.title = "Contents"
    sheet = book.create_sheet(acq.AFCD_SHEET)
    sheet.append(["Release 3 - Nutrient profiles (per 100 g)"])
    sheet.append([None])
    header = [c.replace(" (", " \r\n(", 1) if c not in ("Public Food Key", "Classification", "Food Name") else c
              for c in acq.AFCD_COLUMNS]
    sheet.append(header[:3] + ["Derivation"] + header[3:])
    sheet.append(["F002258", 31302, "Cardamom seed, dried, ground", "Borrowed"] + [1.5] * (len(header) - 3))
    path = tmp_path / "afcd.xlsx"
    book.save(path)
    frame = acq.afcd_parse(path)
    assert list(frame.columns) == list(acq.AFCD_COLUMNS)
    assert frame.iloc[0]["Classification"] == "31302"
    assert frame.iloc[0]["Iron (Fe) (mg)"] == 1.5


def test_afcd_link_is_found():
    page = '<a href="/sites/default/files/2025-12/AFCD%20Release%203%20-%20Nutrient%20profiles.xlsx">Nutrient profiles</a>'
    assert acq.afcd_find_xlsx(page) == ("https://www.foodstandards.gov.au/sites/default/files/2025-12/"
                                        "AFCD%20Release%203%20-%20Nutrient%20profiles.xlsx")


# ---------------------------------------------------------------------- OSM
def test_osm_parse_uses_centres_for_ways_and_deduplicates():
    payload = {"elements": [
        {"type": "node", "id": 218028470, "lat": -37.79, "lon": 145.17,
         "tags": {"shop": "supermarket", "name": "Coles", "brand": "Coles", "addr:housenumber": "55",
                  "addr:street": "Tunstall Square", "opening_hours": "07:00-24:00"}},
        {"type": "way", "id": 5, "center": {"lat": -37.8, "lon": 144.9}, "tags": {"amenity": "marketplace"}},
        {"type": "node", "id": 218028470, "lat": -37.79, "lon": 145.17, "tags": {"shop": "supermarket"}},
        {"type": "relation", "id": 9, "tags": {"shop": "bakery"}}]}
    frame = acq.osm_parse(payload)
    assert frame.osm_id.tolist() == ["node/218028470", "way/5"]
    assert frame.iloc[0].address == "55 Tunstall Square"


def test_osm_query_covers_food_shops_markets_and_organic():
    query = acq.osm_query((-38.5, 144.3, -37.4, 145.9))
    assert "greengrocer" in query and '"amenity"="marketplace"' in query and "organic" in query
    assert "(-38.5,144.3,-37.4,145.9)" in query


# ----------------------------------------------------- hashing and change log
def test_canonical_hash_ignores_row_order_and_number_formatting():
    a = pd.DataFrame({"k": ["x", "y"], "v": ["1,234", "0.5"]})
    b = pd.DataFrame({"k": ["y", "x"], "v": [0.50, 1234]})
    assert acq.canonical_hash(a, ["k"]) == acq.canonical_hash(b, ["k"])
    assert acq.canonical_hash(a, ["k"]) != acq.canonical_hash(b.assign(v=[0.5, 1235]), ["k"])


def test_diff_tables_reports_added_removed_and_changed_columns():
    old = pd.DataFrame({"k": ["a", "b", "c"], "v": [1, 2, 3], "w": ["p", "q", "r"]})
    new = pd.DataFrame({"k": ["b", "c", "d"], "v": [2, 30, 4], "w": ["q", "r", "s"]})
    log = acq.diff_tables(old, new, ["k"]).set_index("k")
    assert log.loc["a", "change"] == "removed" and log.loc["d", "change"] == "added"
    assert log.loc["c", "change"] == "changed" and log.loc["c", "columns"] == "v"
    assert "b" not in log.index


# ----------------------------------------------------------------------- QA
@pytest.mark.parametrize("name", [n for s in acq.SOURCES.values() for n in s.outputs])
def test_committed_reference_files_pass_qa(name):
    report = qa.check(name, acq.read_reference(name))
    assert report["passed"], [r for r in report["rules"] if not r["passed"]]


def test_qa_blocks_schema_drift_and_volume_collapse():
    good = acq.read_reference("urgent_care_clinics_vic.csv")
    assert not qa.check("urgent_care_clinics_vic.csv", good.drop(columns=["phone"]))["passed"]
    shrunk = qa.check("urgent_care_clinics_vic.csv", good.head(20), previous=good)
    failed = {r["rule"] for r in shrunk["rules"] if not r["passed"]}
    assert any(r.startswith("volume") for r in failed)


def test_qa_warning_does_not_block_publication():
    report = qa.check("aihw_mbs_local_areas_vic_2024_25.csv", acq.read_reference("aihw_mbs_local_areas_vic_2024_25.csv"))
    assert report["passed"]
    assert any("fees" in w for w in report["warnings"])


# ---------------------------------------------------------------- run modes
@pytest.fixture
def sandbox(tmp_path, monkeypatch):
    ref = tmp_path / "ref"
    ref.mkdir()
    for name in acq.SOURCES["betterhealth_urgent_care_clinics_2026"].outputs:
        (ref / name).write_bytes((acq.REF / name).read_bytes())
    monkeypatch.setattr(acq, "REF", ref)
    monkeypatch.setattr(acq, "RAW", tmp_path / "raw")
    monkeypatch.setattr(acq, "REPORTS", tmp_path / "reports")
    monkeypatch.setattr(acq, "MANIFEST", ref / "manifest.json")
    return ref


def test_offline_run_writes_manifest_with_hashes(sandbox):
    summary = acq.run(["betterhealth_urgent_care_clinics_2026"], offline=True, dry_run=False, stamp="2026-09-30T000000Z")
    assert summary["sources"]["betterhealth_urgent_care_clinics_2026"]["status"] == "ok"
    manifest = json.loads((sandbox / "manifest.json").read_text())
    entry = manifest["files"]["urgent_care_clinics_vic.csv"]
    assert entry["rows"] == 37 and len(entry["content_sha256"]) == 64 and entry["file_sha256"]


def test_blocked_source_keeps_previous_file(sandbox):
    before = (sandbox / "urgent_care_clinics_vic.csv").read_bytes()

    def offline_getter(url, **_):
        raise acq.FetchError("network blocked")
    summary = acq.run(["betterhealth_urgent_care_clinics_2026"], offline=False, dry_run=False,
                      getter=offline_getter, stamp="2026-09-30T000000Z")
    assert summary["sources"]["betterhealth_urgent_care_clinics_2026"]["status"] == "blocked"
    assert (sandbox / "urgent_care_clinics_vic.csv").read_bytes() == before


def test_live_run_with_changed_feed_writes_change_log(sandbox):
    current = acq.read_reference("urgent_care_clinics_vic.csv")
    records = [{"venue": r["name"], "address": r["address"], "suburb": r["suburb_postcode"],
                "additionalDetails": r["phone"], "openingHours": f'<a href="{r["listing_url"]}">l</a>' if r["listing_url"] else "",
                "latitude": r["latitude"], "longitude": r["longitude"]} for r in current.to_dict("records")]
    records[0]["address"] = "New address"
    feed = json.dumps({"records": records}).encode()
    summary = acq.run(["betterhealth_urgent_care_clinics_2026"], offline=False, dry_run=False,
                      getter=lambda url, **_: feed, stamp="2026-09-30T000000Z")
    result = summary["sources"]["betterhealth_urgent_care_clinics_2026"]
    assert result["status"] == "ok"
    assert result["files"]["urgent_care_clinics_vic.csv"]["change_counts"] == {"changed": 1}
    log = pd.read_csv(acq.REPORTS / "changes" / "2026-09-30_urgent_care_clinics_vic.csv")
    assert log.iloc[0]["columns"] == "address"
