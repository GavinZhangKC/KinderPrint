"""Plan a change (P2): what areas that already look like a planned change are like.

Pure Python on purpose: the backend runs the same arithmetic in the Lambda
bundle, which has no numpy, and a parity test pins the two together.

For a chosen reporting area and a planned change to one or two place features
(tree cover, urban heat, open space, main-road traffic) the engine finds two
groups of other Greater Melbourne areas:

* **like the plan**: the planned features are already near the planned levels;
* **like now**: the planned features are near this area's current levels.

Within each group it keeps the areas most similar to this one on what the plan
does not change: disadvantage (IRSD), number of children assessed, and the
other place features. The contrast between the two groups' AEDC results is an
association across areas. It is never presented as the effect of the change.

All distances are on Greater Melbourne percentiles (0-100), so skewed features
such as traffic do not dominate. Uncertainty is a deterministic bootstrap.
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
