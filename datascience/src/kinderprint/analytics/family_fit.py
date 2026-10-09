"""Family Fit: shared definitions and statistics for the "Where to live" area finder.

The finder helps a family compare Greater Melbourne areas on what matters for
their child's health and development. It is an area-level comparison: it never
describes an individual child, home, school or service, and it never confirms
availability (a childcare vacancy, a GP appointment).

Everything here is deterministic and dependency-light so the backend can mirror
it exactly (see backend/loaders/family_fit.py and the parity test that compares
the two on the published reference scenarios).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

# The eight child-focused priorities. Each uses exactly two measures so no priority
# outweighs another because it has more inputs. Direction +1 means higher is better.
@dataclass(frozen=True)
class Need:
    id: str
    label: str
    measures: tuple[tuple[str, int], ...]
    explains: str
    does_not_confirm: str


NEEDS: tuple[Need, ...] = (
    Need("early_development", "Early development at school entry",
         (("aedc_all_five_on_track_pct", 1), ("aedc_language_on_track_pct", 1)),
         "Share of children in the area on track when they start school (AEDC 2024), adjusted for small numbers of children.",
         "This is an area-level census result. It does not predict how any child will develop."),
    Need("social_emotional", "Social and emotional development",
         (("aedc_social_on_track_pct", 1), ("aedc_emotional_on_track_pct", 1)),
         "Share of children on track for social competence and emotional maturity at school entry (AEDC 2024).",
         "This is an area-level census result, not an assessment of local services or schools."),
    Need("physical_outdoor", "Physical development and outdoor play",
         (("aedc_physical_on_track_pct", 1), ("open_space_pct", 1)),
         "Children on track for physical health at school entry, and the share of land that is public open space.",
         "Open space is measured from 2018 land data; it does not rate playground quality."),
    Need("shade_cooler", "Shade and cooler streets",
         (("urban_heat_degc", -1), ("tree_cover_pct", 1)),
         "How much hotter the area runs than surrounding non-urban land, and its tree cover (2018).",
         "These describe the whole area in 2018, not a particular street today."),
    Need("fewer_pollution_sources", "Fewer traffic and industry sources",
         (("road_traffic_intensity", -1), ("industrial_sites_count", -1)),
         "Traffic on main roads per square kilometre (2019) and industrial sites that report air emissions (2024-25).",
         "These count sources of pollution. They are not measured air quality."),
    Need("gp_access", "GP access",
         (("gp_access_5km", 1), ("nearest_gp_km", -1)),
         "General practices within reach, allowing for neighbouring areas and how many people share them (2025), and the distance to the nearest one.",
         "Listing does not confirm a GP is taking new patients or bulk bills children."),
    Need("childcare_kinder", "Childcare and kinder access",
         (("childcare_places_access_5km", 1), ("kindergartens_per_1000_under5", 1)),
         "Approved childcare places within reach per child under 5, and kindergarten services per 1,000 children under 5 (2026).",
         "Approved places are service capacity. They do not confirm available places."),
    Need("school_transport", "Primary schools and public transport",
         (("primary_schools_per_1000_age5_9", 1), ("transport_stops_per_10000", 1)),
         "Primary school campuses per 1,000 children aged 5-9 (2025) and public transport stops per 10,000 residents (2026).",
         "This counts schools in the area. It does not show school zones or enrolment."),
)
NEED_IDS = tuple(n.id for n in NEEDS)
MEASURE_DIRECTION = {m: d for n in NEEDS for m, d in n.measures}
AEDC_MEASURES = ("aedc_all_five_on_track_pct", "aedc_language_on_track_pct", "aedc_social_on_track_pct",
                 "aedc_emotional_on_track_pct", "aedc_physical_on_track_pct")

# Product rules, stated once and mirrored by the backend.
ESSENTIAL_PERCENTILE = 50.0     # an Essential priority must be at or above the Greater Melbourne median
WEIGHTS = {"prefer": 1.0, "essential": 2.0}
TOP_N = 10
STABLE_SHARE, FAIRLY_STABLE_SHARE = 0.9, 0.6


def eb_beta(k: pd.Series, n: pd.Series, group: pd.Series, min_strength: float = 2.0) -> tuple[pd.Series, pd.Series]:
    """Empirical-Bayes beta-binomial posterior per area, with a beta prior per group.

    The prior for each group (SA4) is fitted by the method of moments after removing the
    expected binomial variance. Areas with few children are pulled further toward their
    region than areas with many. Returns posterior alpha and beta (NaN where k or n is missing).
    """
    a = pd.Series(np.nan, index=k.index, dtype=float)
    b = a.copy()
    ok = k.notna() & n.notna() & (n > 0)
    for _, idx in group[ok].groupby(group[ok]).groups.items():
        kk, nn = k[idx].astype(float), n[idx].astype(float)
        p = kk / nn
        mu = float(np.clip(p.mean(), 1e-3, 1 - 1e-3))
        between = p.var(ddof=1) - float((mu * (1 - mu) / nn).mean()) if len(p) > 1 else 0.0
        strength = max(mu * (1 - mu) / max(between, 1e-4) - 1, min_strength)
        a[idx] = mu * strength + kk
        b[idx] = (1 - mu) * strength + nn - kk
    return a, b


def percentile_rank(values: pd.Series, direction: int) -> pd.Series:
    """Direction-aligned percentile (0-100] among non-missing values, ties averaged."""
    return 100 * (values * direction).rank(pct=True, method="average")


SCORE_DECIMALS = 4  # published precision; comparisons use the published values so engine and API agree exactly


def need_scores(measures: pd.DataFrame) -> pd.DataFrame:
    """Score for each need: the mean of its two measure percentiles (missing if either is).

    Rounded to the published precision so a score of 49.99999999999999 cannot pass or fail the
    Essential threshold differently in the data-science engine and the API.
    """
    pct = {m: percentile_rank(measures[m], d) for m, d in MEASURE_DIRECTION.items()}
    return pd.DataFrame({n.id: pd.concat([pct[m] for m, _ in n.measures], axis=1).mean(axis=1, skipna=False)
                         for n in NEEDS}).round(SCORE_DECIMALS)


def match_score(scores: pd.DataFrame, priorities: dict[str, str], weights: dict[str, float] | None = None) -> pd.Series:
    """Weighted mean of need scores; Essential counts double. NaN if any chosen need is missing."""
    weights = weights or WEIGHTS
    chosen = {k: weights[v] for k, v in priorities.items() if v in weights}
    if not chosen:
        return pd.Series(np.nan, index=scores.index)
    total = sum(scores[k] * w for k, w in chosen.items())
    return total / sum(chosen.values())


def haversine_km(lat1, lon1, lat2, lon2):
    r = np.pi / 180
    dlat, dlon = (lat2 - lat1) * r, (lon2 - lon1) * r
    h = np.sin(dlat / 2) ** 2 + np.cos(lat1 * r) * np.cos(lat2 * r) * np.sin(dlon / 2) ** 2
    return 12742 * np.arcsin(np.sqrt(h))
