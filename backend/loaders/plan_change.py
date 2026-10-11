"""Plan a change: what areas that already look like a planned change are like.

Serves the artefact built by datascience/scripts/build_plan_change.py. The
engine below is a verbatim copy of datascience/src/kinderprint/analytics/
plan_change.py (pure Python, so it runs in the Lambda bundle without numpy);
backend/tests/test_plan_change.py checks it against the published reference
searches so the two cannot drift apart.

The result is an association across areas (matched pairs on disadvantage and
children assessed), never the effect of making the change.
"""
from __future__ import annotations

import hashlib
import math
import random
from dataclasses import dataclass
from typing import Iterable, Mapping, Sequence

# Place features a plan can change. "better" is the direction a plan moves it.
LEVERS: dict[str, dict[str, object]] = {
    "tree_cover": {"column": "tree_cover_pct", "better": "higher", "unit": "percentage points",
                   "label": "Tree and plant cover"},
    "urban_heat": {"column": "urban_heat_degc", "better": "lower", "unit": "°C",
                   "label": "Urban heat"},
    "open_space": {"column": "open_space_pct", "better": "higher", "unit": "percentage points",
                   "label": "Public open space"},
    "road_traffic": {"column": "road_traffic_intensity", "better": "lower", "unit": "percent",
                     "label": "Main-road traffic"},
}
LEVER_IDS = tuple(LEVERS)
# Similarity on what the plan does not change.
COVARIATES = ("irsd", "children_assessed")
OUTCOMES: dict[str, str] = {
    "all_five": "AEDC on track in all five areas of development",
    "physical": "AEDC on track in physical health and wellbeing",
}

BAND = 10.0          # percentile points: "near" a level
K = 12               # areas kept per group
MIN_GROUP = 5        # fewer than this in either group: no result
CALIPER = 40.0       # max covariate distance from this area (percentile points, Euclidean)
PAIR_CALIPER = 10.0  # max covariate distance within a matched pair
BOOTSTRAP = 400
INTERVAL = (0.10, 0.90)  # 80% interval
INFLATE = 1.0        # interval widening, calibrated on shuffled data by build_plan_change.py
SMD_LIMIT = 0.25     # balance check on IRSD and children between the two groups
MAX_LEVERS = 2
DECIMALS = 4


@dataclass(frozen=True)
class Area:
    id: str
    name: str
    levers: Mapping[str, float | None]        # raw values
    covariates: Mapping[str, float | None]    # raw values
    outcomes: Mapping[str, float | None]      # percent on track (small-number adjusted)


def _ecdf(values: Sequence[float]):
    """Mid-distribution percentile of any value against the sample, 0-100.

    100 * (number below + half the number equal) / n. Works for values that are
    not in the sample, such as a planned level.
    """
    ordered = sorted(values)
    n = len(ordered)

    def rank(x: float) -> float:
        below = _bisect_left(ordered, x)
        equal = _bisect_right(ordered, x) - below
        return round(100.0 * (below + 0.5 * equal) / n, DECIMALS)
    return rank


def _bisect_left(a: Sequence[float], x: float) -> int:
    lo, hi = 0, len(a)
    while lo < hi:
        mid = (lo + hi) // 2
        if a[mid] < x:
            lo = mid + 1
        else:
            hi = mid
    return lo


def _bisect_right(a: Sequence[float], x: float) -> int:
    lo, hi = 0, len(a)
    while lo < hi:
        mid = (lo + hi) // 2
        if x < a[mid]:
            hi = mid
        else:
            lo = mid + 1
    return lo


class Engine:
    """Holds the percentile scales for one published table."""

    def __init__(self, areas: Iterable[Area]):
        self.areas = {area.id: area for area in areas}
        self.scales = {}
        for lever in LEVER_IDS:
            values = [a.levers[lever] for a in self.areas.values() if a.levers.get(lever) is not None]
            self.scales[lever] = _ecdf(values)
        for cov in COVARIATES:
            values = [a.covariates[cov] for a in self.areas.values() if a.covariates.get(cov) is not None]
            self.scales[cov] = _ecdf(values)
        self.ranges = {lever: (min(v), max(v)) for lever in LEVER_IDS
                       for v in [[a.levers[lever] for a in self.areas.values() if a.levers.get(lever) is not None]]}

    # ------------------------------------------------------------------ plan values
    def target_value(self, area: Area, lever: str, change: float) -> float:
        """Planned raw level. Traffic changes are percentages of the current level."""
        current = area.levers[lever]
        assert current is not None
        if lever == "road_traffic":
            return current * (1 + change / 100.0)
        return current + change

    def pct(self, key: str, value: float) -> float:
        return self.scales[key](value)

    # ------------------------------------------------------------------ the search
    def evaluate(self, area_id: str, plan: Mapping[str, float], *, k: int = K, band: float = BAND,
                 caliper: float = CALIPER, pair_caliper: float | None = None, bootstrap: int = BOOTSTRAP,
                 inflate: float = INFLATE) -> dict[str, object]:
        pair_caliper = PAIR_CALIPER if pair_caliper is None else pair_caliper
        if area_id not in self.areas:
            return {"status": "unknown_area"}
        if not plan or len(plan) > MAX_LEVERS or any(lever not in LEVERS for lever in plan):
            return {"status": "invalid_plan"}
        area = self.areas[area_id]
        if any(area.levers.get(lever) is None for lever in plan) or any(area.covariates.get(c) is None for c in COVARIATES):
            return {"status": "no_data"}
        targets = {lever: self.target_value(area, lever, change) for lever, change in plan.items()}
        for lever, change in plan.items():
            better = LEVERS[lever]["better"]
            if change == 0 or (better == "higher" and change < 0) or (better == "lower" and change > 0):
                return {"status": "invalid_plan"}
        beyond = [lever for lever, value in targets.items()
                  if not (self.ranges[lever][0] <= value <= self.ranges[lever][1])]
        if beyond:
            return {"status": "beyond_observed", "levers": beyond}

        here = {lever: self.pct(lever, area.levers[lever]) for lever in LEVER_IDS if area.levers.get(lever) is not None}
        goal = {lever: self.pct(lever, targets[lever]) for lever in plan}
        here_cov = {c: self.pct(c, area.covariates[c]) for c in COVARIATES}

        def distance(candidate: Area) -> float | None:
            total = 0.0
            for c in COVARIATES:
                value = candidate.covariates.get(c)
                if value is None:
                    return None
                total += (self.pct(c, value) - here_cov[c]) ** 2
            return math.sqrt(total)

        def pool(centre: Mapping[str, float]) -> list[tuple[float, Area]]:
            chosen = []
            for candidate in self.areas.values():
                if candidate.id == area.id:
                    continue
                ok = True
                for lever in plan:
                    value = candidate.levers.get(lever)
                    if value is None or abs(self.pct(lever, value) - centre[lever]) > band:
                        ok = False
                        break
                if not ok or any(candidate.outcomes.get(o) is None for o in OUTCOMES):
                    continue
                d = distance(candidate)
                if d is None or d > caliper:
                    continue
                chosen.append((round(d, DECIMALS), candidate))
            chosen.sort(key=lambda item: (item[0], item[1].id))
            return chosen

        def cov_gap(x: Area, y: Area) -> float:
            return math.sqrt(sum((self.pct(c, x.covariates[c]) - self.pct(c, y.covariates[c])) ** 2 for c in COVARIATES))

        plan_pool = pool(goal)
        now_pool = pool({lever: here[lever] for lever in plan})
        # Greedy 1:1 pairs, most similar to this area first: each plan-like area
        # is paired with the unused now-like area closest to it on disadvantage
        # and children, within PAIR_CALIPER. Pairs keep the groups balanced.
        pairs: list[tuple[Area, Area]] = []
        used: set[str] = set()
        plan_ids = {c.id for _, c in plan_pool}
        for _, candidate in plan_pool:
            best = None
            for _, partner in now_pool:
                if partner.id in used or partner.id in plan_ids:
                    continue
                gap = cov_gap(candidate, partner)
                if gap <= pair_caliper and (best is None or (gap, partner.id) < best[0]):
                    best = ((gap, partner.id), partner)
            if best is not None:
                used.add(best[1].id)
                pairs.append((candidate, best[1]))
            if len(pairs) == k:
                break
        if len(pairs) < MIN_GROUP:
            return {"status": "too_few_similar", "pairs": len(pairs),
                    "like_plan_count": len(plan_pool), "like_now_count": len(now_pool)}
        like_plan = [(0.0, x) for x, _ in pairs]
        like_now = [(0.0, y) for _, y in pairs]

        seed = int(hashlib.sha256(f"{area.id}|{sorted(plan.items())}|{k}|{band}|{caliper}|{pair_caliper}".encode()).hexdigest()[:12], 16)
        rng = random.Random(seed)
        results = {}
        for outcome in OUTCOMES:
            a = [x.outcomes[outcome] for x, _ in pairs]
            b = [y.outcomes[outcome] for _, y in pairs]
            gaps = [x - y for x, y in zip(a, b)]
            diff = _mean(gaps)
            draws = []
            for _ in range(bootstrap):
                draws.append(_mean([gaps[rng.randrange(len(gaps))] for _ in gaps]))
            draws.sort()
            q_low, q_high = _quantile(draws, INTERVAL[0]), _quantile(draws, INTERVAL[1])
            low = diff - inflate * (diff - q_low)
            high = diff + inflate * (q_high - diff)
            # How far the estimate is from zero in units of its half-interval
            # (used to calibrate INFLATE; > 1 means the direction is clear).
            clarity = diff / (diff - q_low) if diff > 0 and diff > q_low else (
                -diff / (q_high - diff) if diff < 0 and q_high > diff else 0.0)
            results[outcome] = {
                "like_plan_pct": round(_mean(a), 1),
                "like_now_pct": round(_mean(b), 1),
                "difference_pp": round(diff, 1),
                "interval_80_pp": [round(low, 1), round(high, 1)],
                "direction": "higher" if low > 0 else "lower" if high < 0 else "unclear",
                "clarity": round(clarity, 3),
            }
        balance = {c: round(_smd([self.pct(c, x.covariates[c]) for _, x in like_plan],
                                 [self.pct(c, x.covariates[c]) for _, x in like_now]), 2) for c in COVARIATES}
        return {
            "status": "ok",
            "targets": {lever: round(value, 2) for lever, value in targets.items()},
            "like_plan": [{"id": c.id, "name": c.name} for _, c in like_plan],
            "like_now": [{"id": c.id, "name": c.name} for _, c in like_now],
            "outcomes": results,
            "balance_smd": balance,
            "balanced": all(abs(v) <= SMD_LIMIT for v in balance.values()),
        }


def _mean(values: Sequence[float]) -> float:
    return sum(values) / len(values)


def _quantile(sorted_values: Sequence[float], q: float) -> float:
    position = q * (len(sorted_values) - 1)
    lo = int(math.floor(position))
    hi = min(lo + 1, len(sorted_values) - 1)
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (position - lo)


def _smd(a: Sequence[float], b: Sequence[float]) -> float:
    ma, mb = _mean(a), _mean(b)
    va = sum((x - ma) ** 2 for x in a) / max(len(a) - 1, 1)
    vb = sum((x - mb) ** 2 for x in b) / max(len(b) - 1, 1)
    pooled = math.sqrt((va + vb) / 2)
    return 0.0 if pooled == 0 else (ma - mb) / pooled


# Ready-made changes shown on the page, in the units people use.
PRESETS: list[dict[str, object]] = [
    {"id": "trees_5", "label": "5 more points of tree cover", "plan": {"tree_cover": 5.0}},
    {"id": "trees_10", "label": "10 more points of tree cover", "plan": {"tree_cover": 10.0}},
    {"id": "cooler_1", "label": "Streets 1 °C cooler", "plan": {"urban_heat": -1.0}},
    {"id": "cooler_2", "label": "Streets 2 °C cooler", "plan": {"urban_heat": -2.0}},
    {"id": "open_3", "label": "3 more points of open space", "plan": {"open_space": 3.0}},
    {"id": "traffic_50", "label": "Half the main-road traffic", "plan": {"road_traffic": -50.0}},
    {"id": "greener_cooler", "label": "Greener and cooler: +5 points trees, 1 °C cooler",
     "plan": {"tree_cover": 5.0, "urban_heat": -1.0}},
]


# --------------------------------------------------------------------------- serving
import os  # noqa: E402
import re  # noqa: E402
from pathlib import Path  # noqa: E402
from typing import Any  # noqa: E402

from core.data_loader import load_json_source  # noqa: E402
from core.responses import limitation  # noqa: E402
from core.sources import dataset_cache  # noqa: E402

PLAN_CHANGE_DATA_PATH_ENV = "KINDERPRINT_PLAN_CHANGE_DATA_PATH"
_SA2 = re.compile(r"^\d{9}$")


def _num(value, low=None, high=None) -> bool:
    if value is None:
        return True
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return False
    return (low is None or value >= low) and (high is None or value <= high)


def validate(source: dict[str, Any]) -> list[dict[str, Any]]:
    """Limitations describing why the artefact cannot be served (empty when valid)."""
    def bad(message: str):
        return [limitation("plan_change_dataset_invalid", message, "plan_change")]
    params, areas, presets = source.get("parameters"), source.get("areas"), source.get("presets")
    if source.get("schema_version") != 1 or not isinstance(params, dict) or not isinstance(areas, list) \
            or not areas or not isinstance(presets, list) or not presets:
        return bad("The plan dataset must contain schema version 1, parameters, presets and areas.")
    if not _num(params.get("inflate"), 1.0, 5.0) or params.get("inflate") is None:
        return bad("The plan dataset has an invalid interval calibration.")
    seen = set()
    for area in areas:
        if not isinstance(area, dict) or not isinstance(area.get("id"), str) or area["id"] in seen \
                or not isinstance(area.get("neighbourhood_id"), str) or not isinstance(area.get("name"), str):
            return bad("Every area needs a unique id, a name and a neighbourhood id.")
        seen.add(area["id"])
        levers = area.get("levers") or {}
        if set(levers) != set(LEVER_IDS) or not all(_num(v, 0) for v in levers.values()):
            return bad(f"Area {area['id']} has invalid place features.")
        if not all(_num(v, 0, 100) for v in (area.get("outcomes") or {}).values()):
            return bad(f"Area {area['id']} has invalid outcomes.")
    for preset in presets:
        plan = preset.get("plan") if isinstance(preset, dict) else None
        if not isinstance(plan, dict) or not plan or any(k not in LEVERS for k in plan):
            return bad("Every preset needs a valid plan.")
    return []


@dataset_cache(maxsize=4)
def _load(path_text: str | None, mtime: float | None):
    path = Path(path_text) if path_text else None
    source, limits = load_json_source(path, PLAN_CHANGE_DATA_PATH_ENV, "plan_change")
    if source is None:
        return None, limits
    problems = validate(source)
    if problems:
        return None, problems
    areas = [Area(r["id"], r["name"], r["levers"], r["covariates"], r["outcomes"]) for r in source["areas"]]
    return {"source": source, "engine": Engine(areas),
            "by_id": {r["id"]: r for r in source["areas"]},
            "by_sa2": {sa2: r["id"] for r in source["areas"] for sa2 in r["neighbourhood_id"].split("_")}}, []


def load_plan_change():
    value = os.getenv(PLAN_CHANGE_DATA_PATH_ENV)
    path = Path(value).expanduser() if value else None
    mtime = path.stat().st_mtime if path and path.is_file() else None
    return _load(str(path) if path else None, mtime)


def resolve_area(loaded: dict[str, Any], area: str) -> str | None:
    """Accept a reporting-area id (one or more SA2 codes joined by _) or any SA2 inside it."""
    for part in area.split("_"):
        if _SA2.match(part) and part in loaded["by_sa2"]:
            return loaded["by_sa2"][part]
    return None


def _public(row: dict[str, Any]) -> dict[str, Any]:
    return {"id": row["neighbourhood_id"], "name": row["name"]}


def setup(loaded: dict[str, Any]) -> dict[str, Any]:
    source = loaded["source"]
    engine: Engine = loaded["engine"]
    levers = []
    for lever_id, spec in LEVERS.items():
        low, high = engine.ranges[lever_id]
        levers.append({"id": lever_id, "label": spec["label"], "unit": spec["unit"], "better": spec["better"],
                       "melbourne_range": [round(low, 2), round(high, 2)]})
    return {"levers": levers, "presets": source["presets"], "outcomes": source["outcomes"],
            "max_levers": MAX_LEVERS, "caveat": source["caveat"], "sources": source["sources"],
            "model": source["model"], "built_utc": source["built_utc"]}


def area_detail(loaded: dict[str, Any], area_id: str) -> dict[str, Any]:
    row = loaded["by_id"][area_id]
    engine: Engine = loaded["engine"]
    features = {}
    for lever_id, value in row["levers"].items():
        features[lever_id] = None if value is None else {
            "value": value, "melbourne_percentile": round(engine.pct(lever_id, value), 1)}
    return {**_public(row), "sa4": row["sa4"], "place_features": features, "outcomes_2024": {k: (None if v is None else round(v, 1)) for k, v in row["outcomes"].items()},
            "outlook_2027": row["outlook_2027"], "children_assessed_2024": row["covariates"]["children_assessed"]}


def evaluate(loaded: dict[str, Any], area_id: str, plan: dict[str, float]) -> dict[str, Any]:
    source = loaded["source"]
    params = source["parameters"]
    result = loaded["engine"].evaluate(area_id, plan, inflate=params["inflate"])
    by_id = loaded["by_id"]
    if result.get("status") == "ok":
        result = dict(result)
        result["like_plan"] = [_public(by_id[a["id"]]) for a in result["like_plan"]]
        result["like_now"] = [_public(by_id[a["id"]]) for a in result["like_now"]]
        for outcome in result["outcomes"].values():
            outcome.pop("clarity", None)
    return {"area": _public(by_id[area_id]), "plan": plan, **result}
