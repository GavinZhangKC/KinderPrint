"""Family Fit: the "Where to live" area finder.

Serves the validated artefact built by datascience/scripts/build_family_fit.py and
ranks areas for a family's search. The scoring mirrors
datascience/src/kinderprint/analytics/family_fit.py exactly; the parity test in
backend/tests/test_family_fit.py checks both on the published reference scenarios.

Pure Python on purpose: the Lambda package has no numpy, and a search over 346
areas with 200 confidence re-runs takes well under a second.
"""
from __future__ import annotations

import hashlib
import math
import random
from functools import lru_cache
from typing import Any

import os
from pathlib import Path

from core.data_loader import load_json_source
from core.responses import limitation

FAMILY_FIT_DATA_PATH_ENV = "KINDERPRINT_FAMILY_FIT_DATA_PATH"
FAMILY_FIT_SHAPES_DATA_PATH_ENV = "KINDERPRINT_FAMILY_FIT_SHAPES_DATA_PATH"
LEVELS = {"prefer", "essential"}
DRAWS = 200
RADII_KM = (5, 10, 15, 25)
AEDC_PREFIX = "aedc_"
CHANGE_FLAGS = {"up", "down", "no_clear_change", "not_available"}


def _path(env: str) -> Path | None:
    value = os.getenv(env)
    return Path(value).expanduser() if value else None


def _number(value, low=None, high=None) -> bool:
    if value is None:
        return True
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return False
    return (low is None or value >= low) and (high is None or value <= high)


def validate(source: dict[str, Any]) -> list[dict[str, Any]]:
    """Return limitations describing why the artefact cannot be served (empty when valid)."""
    def bad(message: str):
        return [limitation("family_fit_dataset_invalid", message, "family_fit")]
    meta, needs, areas = source.get("metadata"), source.get("needs"), source.get("areas")
    if not isinstance(meta, dict) or not isinstance(needs, list) or not isinstance(areas, list) or not areas:
        return bad("The Family Fit dataset must contain metadata, needs and areas.")
    if not _number(meta.get("essential_percentile"), 0, 100) or not isinstance(meta.get("weights"), dict):
        return bad("The Family Fit dataset has invalid scoring rules.")
    need_ids = set()
    measures = set()
    for need in needs:
        if not isinstance(need, dict) or not isinstance(need.get("id"), str) or len(need.get("measures", [])) != 2:
            return bad("Every need must have an id and exactly two measures.")
        for m in need["measures"]:
            if m.get("direction") not in (1, -1) or not isinstance(m.get("id"), str):
                return bad(f"Need {need['id']} has an invalid measure.")
            measures.add(m["id"])
        need_ids.add(need["id"])
    if len(need_ids) != len(needs):
        return bad("Need ids must be unique.")
    seen = set()
    for area in areas:
        if not isinstance(area, dict) or not isinstance(area.get("id"), str) or area["id"] in seen:
            return bad("Every area needs a unique id.")
        seen.add(area["id"])
        if not _number(area.get("latitude"), -39.5, -37.0) or not _number(area.get("longitude"), 143.5, 146.5) \
                or area.get("latitude") is None or area.get("longitude") is None:
            return bad(f"Area {area['id']} has an invalid location.")
        if set(area.get("needs", {})) != need_ids or not all(_number(v, 0, 100) for v in area["needs"].values()):
            return bad(f"Area {area['id']} has invalid need scores.")
        if set(area.get("percentiles", {})) != measures or not all(_number(v, 0, 100) for v in area["percentiles"].values()):
            return bad(f"Area {area['id']} has invalid percentiles.")
        for ab in (area.get("adjustment") or {}).values():
            if ab is not None and (len(ab) != 2 or not all(_number(v, 1e-9) and v is not None for v in ab)):
                return bad(f"Area {area['id']} has invalid adjustment parameters.")
        if area.get("all_five_change_flag") not in CHANGE_FLAGS:
            return bad(f"Area {area['id']} has an invalid change flag.")
        outlook = area.get("outlook_2027")
        if outlook is not None and not (_number(outlook.get("lower80"), 0, 100) and _number(outlook.get("pct"), 0, 100)
                                        and _number(outlook.get("upper80"), 0, 100)
                                        and outlook["lower80"] <= outlook["pct"] <= outlook["upper80"]):
            return bad(f"Area {area['id']} has an invalid outlook.")
    return []


@lru_cache(maxsize=4)
def _load(path_text: str | None, mtime: float | None):
    path = Path(path_text) if path_text else None
    source, limits = load_json_source(path, FAMILY_FIT_DATA_PATH_ENV, "family_fit")
    if source is None:
        return None, limits
    problems = validate(source)
    if problems:
        return None, problems
    return source, []


def load_family_fit():
    path = _path(FAMILY_FIT_DATA_PATH_ENV)
    mtime = path.stat().st_mtime if path and path.is_file() else None
    return _load(str(path) if path else None, mtime)


def load_shapes():
    path = _path(FAMILY_FIT_SHAPES_DATA_PATH_ENV)
    source, limits = load_json_source(path, FAMILY_FIT_SHAPES_DATA_PATH_ENV, "family_fit_shapes")
    if source is None:
        return None, limits
    areas = source.get("areas")
    if not isinstance(areas, dict) or not all(isinstance(v, list) for v in areas.values()):
        return None, [limitation("family_fit_shapes_invalid", "The area outline dataset is invalid.", "family_fit_shapes")]
    return areas, []


# --------------------------------------------------------------------------- scoring

def haversine_km(lat1, lon1, lat2, lon2) -> float:
    r = math.pi / 180
    h = math.sin((lat2 - lat1) * r / 2) ** 2 + math.cos(lat1 * r) * math.cos(lat2 * r) * math.sin((lon2 - lon1) * r / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def parse_priorities(text: str, need_ids: set[str]) -> dict[str, str]:
    """'early_development:essential,gp_access:prefer' -> dict. Raises ValueError on bad input."""
    out = {}
    for part in [p for p in (text or "").split(",") if p.strip()]:
        need, _, level = part.strip().partition(":")
        if need not in need_ids or level not in LEVELS or need in out:
            raise ValueError(part)
        out[need] = level
    return out


def percentile_ranks(values: list[float | None], direction: int) -> list[float | None]:
    """Direction-aligned percentile (0-100], ties averaged; mirrors pandas rank(pct=True, method='average')."""
    pairs = sorted((v * direction, i) for i, v in enumerate(values) if v is not None)
    n, out, i = len(pairs), [None] * len(values), 0
    while i < n:
        j = i
        while j + 1 < n and pairs[j + 1][0] == pairs[i][0]:
            j += 1
        pct = 100 * ((i + 1) + (j + 1)) / 2 / n
        for k in range(i, j + 1):
            out[pairs[k][1]] = pct
        i = j + 1
    return out


def match_scores(need_values: dict[str, list[float | None]], priorities: dict[str, str], weights: dict[str, float]):
    count = len(next(iter(need_values.values())))
    total_w = sum(weights[level] for level in priorities.values())
    out = []
    for i in range(count):
        parts = [(need_values[need][i], weights[level]) for need, level in priorities.items()]
        out.append(None if any(v is None for v, _ in parts) else sum(v * w for v, w in parts) / total_w)
    return out


def _phrase(pct: float) -> str:
    if pct >= 75:
        return "in the top quarter of Melbourne areas"
    if pct >= 50:
        return "above the Melbourne median"
    if pct >= 25:
        return "below the Melbourne median"
    return "in the bottom quarter of Melbourne areas"


def _stability_label(share: float) -> str:
    return "stable" if share >= 0.9 else "fairly_stable" if share >= 0.6 else "could_change"


def search(anchor_id: str, radius_km: float, priorities: dict[str, str], limit: int = 10) -> tuple[dict | None, list]:
    source, limits = load_family_fit()
    if source is None:
        return None, limits
    meta, needs, areas = source["metadata"], source["needs"], source["areas"]
    weights, essential = meta["weights"], meta["essential_percentile"]
    by_id = {a["id"]: a for a in areas}
    if anchor_id not in by_id:
        return {"error": "unknown_anchor"}, []
    anchor = by_id[anchor_id]
    need_index = {n["id"]: n for n in needs}
    dist = [haversine_km(anchor["latitude"], anchor["longitude"], a["latitude"], a["longitude"]) for a in areas]
    need_values = {n: [a["needs"][n] for a in areas] for n in need_index}
    fit = match_scores(need_values, priorities, weights) if priorities else [None] * len(areas)

    status, eligible = [], []
    for i, a in enumerate(areas):
        if dist[i] > radius_km:
            status.append("outside")
        elif fit[i] is None:
            status.append("no_data")
        elif any(level == "essential" and a["needs"][n] < essential for n, level in priorities.items()):
            status.append("filtered_out")
        else:
            status.append("match")
            eligible.append(i)
    ranked = sorted(eligible, key=lambda i: (-fit[i], areas[i]["id"]))
    top = ranked[:max(limit, 10)]

    # Confidence: redraw the small-numbers-adjusted AEDC shares and count top-10 places.
    used = sorted({m["id"] for n in priorities for m in need_index[n]["measures"]} & {
        m for a in areas[:1] for m in a["adjustment"]})
    stability = {}
    if used and ranked:
        seed = int(hashlib.sha256(f"{anchor_id}|{radius_km}|{sorted(priorities.items())}|{meta.get('built_utc')}".encode())
                   .hexdigest()[:12], 16)
        rng = random.Random(seed)
        direction = {m["id"]: m["direction"] for n in needs for m in n["measures"]}
        base_pct = {m: [a["percentiles"][m] for a in areas] for m in direction}
        hits = {i: 0 for i in eligible}
        eligible_set = set(eligible)
        for _ in range(DRAWS):
            pct = dict(base_pct)
            for m in used:
                draw = [100 * rng.betavariate(*a["adjustment"][m]) if a["adjustment"].get(m) else None for a in areas]
                pct[m] = percentile_ranks(draw, direction[m])
            nv = {}
            for n in priorities:
                ms = [m["id"] for m in need_index[n]["measures"]]
                nv[n] = [None if any(pct[m][i] is None for m in ms) else sum(pct[m][i] for m in ms) / len(ms)
                         for i in range(len(areas))]
            sim = match_scores(nv, priorities, weights)
            order = sorted((i for i in eligible_set if sim[i] is not None), key=lambda i: (-sim[i], areas[i]["id"]))
            for i in order[:10]:
                hits[i] += 1
        stability = {i: hits[i] / DRAWS for i in eligible}

    def result(rank: int, i: int) -> dict:
        a = areas[i]
        chosen = sorted(priorities, key=lambda n: -a["needs"][n])
        reasons = [{"need": n, "label": need_index[n]["label"], "percentile": round(a["needs"][n], 1),
                    "phrase": _phrase(a["needs"][n])} for n in chosen[:2]]
        weakest = chosen[-1] if len(chosen) > 2 else None
        if weakest and a["needs"][weakest] < 50:
            limitation_item = {"type": "weaker_priority", "need": weakest, "label": need_index[weakest]["label"],
                               "percentile": round(a["needs"][weakest], 1), "phrase": _phrase(a["needs"][weakest])}
        else:
            # Every card carries one limitation: when no chosen priority is weak, say what the
            # strongest reason does not confirm (for example, places are capacity, not vacancies).
            lead = chosen[0]
            limitation_item = {"type": "does_not_confirm", "need": lead, "label": need_index[lead]["label"],
                               "text": need_index[lead]["does_not_confirm"]}
        share = stability.get(i)
        return {"rank": rank, "id": a["id"], "name": a["name"], "sa3": a["sa3"],
                "latitude": a["latitude"], "longitude": a["longitude"],
                "distance_km": round(dist[i], 2), "match": round(fit[i], 1),
                "reasons": reasons, "limitation": limitation_item,
                "stability": None if share is None else {"share": round(share, 3), "label": _stability_label(share)},
                "school_entry_change": {"pp": a["all_five_change_2015_2024_pp"], "flag": a["all_five_change_flag"]},
                "outlook_2027": a["outlook_2027"]}

    suggestions = []
    if len(ranked) < 5:
        for n, level in priorities.items():
            if level == "essential":
                relaxed = {**priorities, n: "prefer"}
                fit_r = match_scores(need_values, relaxed, weights)
                count = sum(1 for i, a in enumerate(areas) if dist[i] <= radius_km and fit_r[i] is not None and
                            all(a["needs"][k] >= essential for k, v in relaxed.items() if v == "essential"))
                if count > len(ranked):
                    suggestions.append({"type": "make_preferred", "need": n, "label": need_index[n]["label"],
                                        "results": count})
        for r in RADII_KM:
            if r > radius_km:
                count = sum(1 for i, a in enumerate(areas) if dist[i] <= r and fit[i] is not None and
                            all(a["needs"][k] >= essential for k, v in priorities.items() if v == "essential"))
                if count > len(ranked):
                    suggestions.append({"type": "widen_distance", "radius_km": r, "results": count})
                    break

    return {
        "anchor": {"id": anchor["id"], "name": anchor["name"], "latitude": anchor["latitude"], "longitude": anchor["longitude"]},
        "radius_km": radius_km, "priorities": priorities,
        "counts": {"within_distance": sum(s != "outside" for s in status), "matching": len(ranked),
                   "below_essential": status.count("filtered_out"), "data_unavailable": status.count("no_data")},
        "results": [result(k + 1, i) for k, i in enumerate(ranked[:limit])],
        "more_available": max(len(ranked) - limit, 0),
        "map": [{"id": areas[i]["id"], "status": ("top" if i in top[:10] else status[i])} for i in range(len(areas))],
        "suggestions": suggestions,
        "confidence": {"draws": DRAWS if used else 0, "measures_varied": used},
    }, []


def area_detail(area_id: str) -> tuple[dict | None, list]:
    source, limits = load_family_fit()
    if source is None:
        return None, limits
    area = next((a for a in source["areas"] if a["id"] == area_id), None)
    if area is None:
        return {"error": "unknown_area"}, []
    needs = []
    for n in source["needs"]:
        needs.append({"id": n["id"], "label": n["label"], "percentile": area["needs"][n["id"]],
                      "phrase": None if area["needs"][n["id"]] is None else _phrase(area["needs"][n["id"]]),
                      "explains": n["explains"], "does_not_confirm": n["does_not_confirm"],
                      "measures": [{"id": m["id"], "direction": m["direction"], "value": area["measures"][m["id"]],
                                    "percentile": area["percentiles"][m["id"]]} for m in n["measures"]]})
    return {"id": area["id"], "name": area["name"], "sa3": area["sa3"], "sa4": area["sa4"],
            "latitude": area["latitude"], "longitude": area["longitude"], "needs": needs,
            "children_assessed_2024": area["children_assessed_2024"],
            "school_entry_change": {"pp": area["all_five_change_2015_2024_pp"], "flag": area["all_five_change_flag"],
                                    "years": "2015 to 2024", "measure": "children on track in all five AEDC areas"},
            "outlook_2027": area["outlook_2027"]}, []


def places() -> tuple[list | None, list]:
    source, limits = load_family_fit()
    if source is None:
        return None, limits
    return sorted(({"id": a["id"], "name": a["name"], "sa3": a["sa3"]} for a in source["areas"]),
                  key=lambda p: p["name"]), []


def needs_and_rules() -> tuple[dict | None, list]:
    source, limits = load_family_fit()
    if source is None:
        return None, limits
    return {"needs": source["needs"], "essential_percentile": source["metadata"]["essential_percentile"],
            "weights": source["metadata"]["weights"], "model_version": source["metadata"]["model_version"],
            "built_utc": source["metadata"]["built_utc"], "radii_km": list(RADII_KM),
            "validation": source["metadata"].get("validation", {})}, []
