"""Quality rules for the Iteration-3 reference files.

Every rule returns pass/fail with the evidence (counts and examples) so the JSON
report in reports/iteration3/qa_<file>.json explains a failure without re-running.
A file that fails any rule is not published by acquire_iteration3.py.

Rule families
-------------
schema        exact required columns
volume        minimum rows and drift against the previously committed file
keys          primary key present and unique
domain        numeric ranges, category sets, date formats
geography     coordinates inside the Victorian (or Greater Melbourne) envelope
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable

import pandas as pd

VIC_BOUNDS = (-39.3, -33.9, 140.9, 150.1)          # lat min, lat max, lon min, lon max
MELBOURNE_BOUNDS = (-38.6, -37.2, 144.2, 146.2)


@dataclass
class Spec:
    columns: list[str]
    keys: list[str]
    min_rows: int
    max_drift: float = 0.30                           # relative change in rows vs previous file
    nullable_keys: tuple[str, ...] = ()
    bounds: tuple[float, float, float, float] | None = None
    extra: list[Callable[[pd.DataFrame], dict]] = field(default_factory=list)


def _num(series: pd.Series) -> pd.Series:
    text = series.astype(str).str.replace(r"[$,%]", "", regex=True).str.strip()
    return pd.to_numeric(text.replace({"": pd.NA, "nan": pd.NA}), errors="coerce")


def rule(name: str, passed: bool, severity: str = "error", **evidence) -> dict:
    """severity 'error' blocks publication; 'warn' is reported and handled downstream."""
    return {"rule": name, "passed": bool(passed), "severity": severity, **evidence}


# ----------------------------------------------------------- domain rules
def _percent_items(frame: pd.DataFrame) -> dict:
    percent_codes = {"MYH-RM0015", "MYH-RM0035", "MYH-RM0036", "MYH-RM0037", "MYH-RM0038", "MYH-RM0039"}
    values = _num(frame.loc[frame.reported_measure_code.isin(percent_codes), "value"])
    bad = values[(values < 0) | (values > 100)]
    return rule("percent measures within 0-100", bad.empty, violations=int(len(bad)))


def _value_or_suppression(frame: pd.DataFrame) -> dict:
    values = _num(frame["value"])
    missing = frame[values.isna() & frame["suppressions"].fillna("").eq("")]
    return rule("every data item has a value or a suppression code", missing.empty,
                violations=int(len(missing)), examples=missing.head(3).to_dict("records"))


def _iso_periods(frame: pd.DataFrame) -> dict:
    ok = frame["start"].astype(str).str.fullmatch(r"\d{4}-\d{2}-\d{2}") & \
        frame["end"].astype(str).str.fullmatch(r"\d{4}-\d{2}-\d{2}") & (frame["start"].astype(str) < frame["end"].astype(str))
    return rule("periods are ISO dates with start before end", ok.all(), violations=int((~ok).sum()))


def _has_current_period(frame: pd.DataFrame) -> dict:
    latest = frame["end"].astype(str).max()
    return rule("latest period ends on or after 2024-06-30", latest >= "2024-06-30", latest=latest)


def _mbs_numeric(frame: pd.DataFrame) -> dict:
    values = _num(frame["value"])
    bad = frame[values.isna() & frame["flag"].fillna("").ne("n.p.")]
    negative = int((values < 0).sum())
    return rule("values numeric unless flagged n.p.; none negative", bad.empty and negative == 0,
                non_numeric=int(len(bad)), negative=negative)


def _mbs_sa3_codes(frame: pd.DataFrame) -> dict:
    sa3 = frame[frame.unit == "SA3"]
    ok = sa3.code.astype(str).str.fullmatch(r"2\d{4}")
    return rule("Victorian SA3 codes are 5 digits starting with 2", ok.all(),
                violations=int((~ok).sum()), sa3_count=int(sa3.code.nunique()))


def _mbs_fees_cover_benefits(frame: pd.DataFrame) -> dict:
    numbers = frame.assign(number=_num(frame["value"]))
    wide = numbers.groupby(["unit", "code", "service", "demographic", "measure"]).number.first().unstack("measure")
    fees = wide.get("Total provider fees ($)", pd.Series(dtype=float))
    benefits = wide.get("Total Medicare benefits paid ($)", pd.Series(dtype=float))
    both = fees.notna() & benefits.notna()
    below = (fees < benefits * 0.999) & both
    examples = [dict(zip(["unit", "code", "service", "demographic"], idx)) for idx in below[below].index[:5]]
    return rule("provider fees are not below Medicare benefits (derived gap is nulled where they are)",
                not below.any(), severity="warn", violations=int(below.sum()), checked=int(both.sum()),
                examples=examples)


def _ucc_phone(frame: pd.DataFrame) -> dict:
    phone = frame.phone.astype(str).str.replace(r"\s", "", regex=True)
    valid = phone.str.fullmatch(r"(0\d{9}|1[38]00\d{6}|13\d{4})")
    blank = phone.eq("")
    return rule("phone numbers are Australian format; at least 90% of clinics list one",
                (valid | blank).all() and valid.mean() >= 0.9,
                invalid=frame.loc[~(valid | blank), "name"].tolist(), without_phone=frame.loc[blank, "name"].tolist())


def _ucc_links(frame: pd.DataFrame) -> dict:
    url = frame.listing_url.astype(str)
    healthdirect = url.str.startswith("https://www.healthdirect.gov.au/")
    https = url.str.startswith("https://") | url.eq("")
    return rule("links are https; at least 90% point to a healthdirect listing",
                https.all() and healthdirect.mean() >= 0.9,
                healthdirect_share=round(float(healthdirect.mean()), 3), not_https=int((~https).sum()))


def _nndss_months(frame: pd.DataFrame) -> dict:
    ok = frame.year_month.astype(str).str.fullmatch(r"(19|20)\d{2}-(0[1-9]|1[0-2])")
    counts = _num(frame.notifications)
    return rule("year_month is YYYY-MM and notifications are positive integers",
                ok.all() and (counts > 0).all() and (counts % 1 == 0).all(),
                bad_months=int((~ok).sum()), bad_counts=int(((counts <= 0) | (counts % 1 != 0)).sum()))


def _nndss_reference_years(frame: pd.DataFrame) -> dict:
    years = set(frame.year_month.astype(str).str[:4])
    needed = {"2016", "2017", "2018", "2019", "2022", "2023", "2024"}
    return rule("all seasonal reference years present", needed <= years, missing=sorted(needed - years))


def _nndss_age_groups(frame: pd.DataFrame) -> dict:
    groups = set(frame.age_group.replace("", pd.NA).dropna().astype(str))
    ok = all(re.fullmatch(r"\d{2}-\d{2}|85\+|Unknown", g) for g in groups)
    children = {"00-04", "05-09", "10-14"} <= groups
    return rule("age groups are five-year bands including 0-14", ok and children, groups=sorted(groups))


def _osm_types(frame: pd.DataFrame) -> dict:
    shops = {"supermarket", "greengrocer", "butcher", "bakery", "deli", "seafood", "health_food", "farm"}
    organic = frame.organic.fillna("").isin(["yes", "only"])
    relevant = frame.shop.fillna("").isin(shops) | frame.amenity.fillna("").eq("marketplace") | organic
    return rule("every outlet is a food shop, marketplace or tagged organic", relevant.all(),
                violations=int((~relevant).sum()))


def _osm_ids(frame: pd.DataFrame) -> dict:
    ok = frame.osm_id.astype(str).str.fullmatch(r"(node|way|relation)/\d+")
    return rule("OSM ids are type/number", ok.all(), violations=int((~ok).sum()))


AFCD_NUTRIENTS = ["Energy with dietary fibre, equated (kJ)", "Protein (g)", "Fat, total (g)",
                  "Total dietary fibre (g)", "Calcium (Ca) (mg)", "Iron (Fe) (mg)", "Zinc (Zn) (mg)",
                  "Iodine (I) (ug)", "Vitamin C (mg)", "Vitamin D3 equivalents (ug)"]


def _afcd_ranges(frame: pd.DataFrame) -> dict:
    report = {}
    for column in AFCD_NUTRIENTS:
        values = _num(frame[column])
        report[column] = int((values < 0).sum())
    energy = _num(frame["Energy with dietary fibre, equated (kJ)"])
    macros = _num(frame["Protein (g)"]).fillna(0) + _num(frame["Fat, total (g)"]).fillna(0)
    return rule("nutrients non-negative; energy <= 3,800 kJ and protein + fat <= 100 g per 100 g",
                sum(report.values()) == 0 and (energy.dropna() <= 3800).all() and (macros <= 100.5).all(),
                negatives=report, energy_over=int((energy > 3800).sum()), macro_over=int((macros > 100.5).sum()))


def _afcd_keys(frame: pd.DataFrame) -> dict:
    ok = frame["Public Food Key"].astype(str).str.fullmatch(r"F\d{6}")
    return rule("food keys are F + 6 digits", ok.all(), violations=int((~ok).sum()))


def _hospital_flags(frame: pd.DataFrame) -> dict:
    ok = frame.private.astype(str).isin(["0", "1"]) & frame.closed.astype(str).isin(["0", "1"])
    hospitals = frame[frame.code.astype(str).str.fullmatch(r"H\d{4}")]
    return rule("private/closed flags are 0/1 and at least 200 hospital units", ok.all() and len(hospitals) >= 200,
                hospitals=int(len(hospitals)), bad_flags=int((~ok).sum()))


def _open_hospitals_located(frame: pd.DataFrame) -> dict:
    open_h = frame[frame.code.astype(str).str.fullmatch(r"H\d{4}") & frame.closed.astype(str).eq("0")]
    missing = open_h[_num(open_h.latitude).isna() | _num(open_h.longitude).isna()]
    share = 1 - len(missing) / max(len(open_h), 1)
    return rule("at least 95% of open hospitals have coordinates", share >= 0.95, located_share=round(share, 4))


SPECS: dict[str, Spec] = {
    "myhospitals_vic_hospitals.csv": Spec(
        ["code", "name", "private", "closed", "latitude", "longitude", "lhn", "alternative_names"],
        ["code"], 300, bounds=VIC_BOUNDS, extra=[_hospital_flags, _open_hospitals_located]),
    "myhospitals_reported_measures.csv": Spec(
        ["reported_measure_code", "measure_code", "measure_name", "reported_measure_name", "units"],
        ["reported_measure_code"], 40, max_drift=0.25),
    "myhospitals_vic_data_items.csv": Spec(
        ["code", "reported_measure_code", "value", "start", "end", "suppressions", "peer_group"],
        ["code", "reported_measure_code"], 1200,
        extra=[_percent_items, _value_or_suppression, _iso_periods, _has_current_period]),
    "aihw_mbs_local_areas_vic_2024_25.csv": Spec(
        ["unit", "code", "name", "service", "measure", "demographic", "value", "flag"],
        ["unit", "code", "service", "measure", "demographic"], 8000, max_drift=0.10,
        extra=[_mbs_numeric, _mbs_sa3_codes, _mbs_fees_cover_benefits]),
    "urgent_care_clinics_vic.csv": Spec(
        ["name", "address", "suburb_postcode", "phone", "listing_url", "latitude", "longitude"],
        ["name"], 30, max_drift=0.25, bounds=VIC_BOUNDS, extra=[_ucc_phone, _ucc_links]),
    "nndss_influenza_vic_monthly.csv": Spec(
        ["year_month", "age_group", "notifications"], ["year_month", "age_group"], 2500,
        nullable_keys=("age_group",), extra=[_nndss_months, _nndss_reference_years, _nndss_age_groups]),
    "nndss_salmonella_vic_monthly.csv": Spec(
        ["year_month", "age_group", "notifications"], ["year_month", "age_group"], 2500,
        nullable_keys=("age_group",), extra=[_nndss_months, _nndss_reference_years, _nndss_age_groups]),
    "osm_food_outlets_melbourne.csv": Spec(
        ["osm_id", "name", "shop", "amenity", "organic", "brand", "address", "opening_hours", "latitude", "longitude"],
        ["osm_id"], 2000, max_drift=0.25, bounds=MELBOURNE_BOUNDS, extra=[_osm_types, _osm_ids]),
    "afcd_r3_selected_per100g.csv": Spec(
        ["Public Food Key", "Classification", "Food Name", "Energy with dietary fibre, equated (kJ)",
         "Protein (g)", "Fat, total (g)", "Total dietary fibre (g)", "Total sugars (g)", "Added sugars (g)",
         "Calcium (Ca) (mg)", "Iodine (I) (ug)", "Iron (Fe) (mg)", "Magnesium (Mg) (mg)", "Potassium (K) (mg)",
         "Sodium (Na) (mg)", "Zinc (Zn) (mg)", "Vitamin A retinol equivalents (ug)",
         "Dietary folate equivalents (ug)", "Vitamin C (mg)", "Vitamin D3 equivalents (ug)",
         "Total long chain omega 3 fatty acids, equated (%T)", "Total long chain omega 3 fatty acids, equated (mg)"],
        ["Public Food Key"], 1400, max_drift=0.10, extra=[_afcd_ranges, _afcd_keys]),
}


def check(name: str, frame: pd.DataFrame, previous: pd.DataFrame | None = None) -> dict:
    spec = SPECS[name]
    frame = frame.astype(object).where(frame.notna(), "")
    rules: list[dict] = []
    missing = [c for c in spec.columns if c not in frame.columns]
    extra = [c for c in frame.columns if c not in spec.columns]
    rules.append(rule("schema: required columns present, no extras", not missing and not extra,
                      missing=missing, unexpected=extra))
    if missing:
        return {"file": name, "rows": int(len(frame)), "passed": False, "rules": rules}
    rules.append(rule(f"volume: at least {spec.min_rows} rows", len(frame) >= spec.min_rows, rows=int(len(frame))))
    if previous is not None and len(previous):
        drift = (len(frame) - len(previous)) / len(previous)
        rules.append(rule(f"volume: row drift within +/-{spec.max_drift:.0%} of previous file",
                          abs(drift) <= spec.max_drift, previous=int(len(previous)), drift=round(drift, 4)))
    required = [k for k in spec.keys if k not in spec.nullable_keys]
    blank = frame[required].astype(str).apply(lambda s: s.str.strip().eq("")).any(axis=1)
    rules.append(rule("keys: key columns populated", not blank.any(), violations=int(blank.sum())))
    duplicated = frame.duplicated(spec.keys, keep=False)
    rules.append(rule("keys: primary key unique", not duplicated.any(), violations=int(duplicated.sum()),
                      examples=frame.loc[duplicated, spec.keys].head(3).to_dict("records")))
    if spec.bounds:
        lat, lon = _num(frame.latitude), _num(frame.longitude)
        located = lat.notna() & lon.notna()
        inside = lat.between(spec.bounds[0], spec.bounds[1]) & lon.between(spec.bounds[2], spec.bounds[3])
        rules.append(rule("geography: coordinates inside the expected envelope", (inside | ~located).all(),
                          outside=int((located & ~inside).sum()), located=int(located.sum())))
    for check_fn in spec.extra:
        try:
            rules.append(check_fn(frame))
        except Exception as error:  # a rule that cannot run is a failure, not a pass
            rules.append(rule(check_fn.__name__, False, error=f"{type(error).__name__}: {error}"))
    passed = all(r["passed"] for r in rules if r.get("severity", "error") == "error")
    warnings = [r["rule"] for r in rules if not r["passed"] and r.get("severity") == "warn"]
    return {"file": name, "rows": int(len(frame)), "passed": passed, "warnings": warnings, "rules": rules}
