"""
Community matching — M0 through M4.

Every version is retained and runnable. The progression is the evidence: each
step was triggered by a diagnostic the previous step failed, and the final
change (M3 -> M4) was triggered by an audit finding rather than a metric.

    M0  unscaled Euclidean KNN      -> dominated by large-scale features
    M1  standardised Euclidean      -> correlated covariates double-counted
    M2  Mahalanobis                 -> geographically implausible pairs
    M3  Mahalanobis, SA4-stratified -> violated the project's own leakage rule
    M4  as M3, IRSD removed         -> ADOPTED (see ADR-006)

Rule (ADR-006): IRSD is constructed from Census income, education, employment,
housing and family composition. It must not appear in the same distance metric
as those variables. M3 did exactly that; M4 removes IRSD, which additionally
frees IRSD to serve as an OUT-OF-SAMPLE check on match quality.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# Adopted feature set. Census measures only: no IRSD, no environment, no AEDC.
MATCH_FEATURES_M4 = [
    "median_hh_income_weekly",
    "unemployment_rate",
    "one_parent_family_pct",
    "no_qualification_pct",
    "children_0_4_pct",
    "median_age",
    "avg_household_size",
]

# Superseded, retained so the evolution is reproducible.
MATCH_FEATURES_M3 = [
    "irsd_score", "median_hh_income_weekly", "unemployment_rate",
    "one_parent_family_pct", "children_0_4_pct", "median_age", "avg_household_size",
]

# Never permitted in any matching metric.
FORBIDDEN_IN_MATCHING = {
    "vegetation_pct", "uhi_degc", "open_space_pct",      # the variables under investigation
    "vulnerable_pct", "vulnerable_n", "vuln2_pct", "ontrack5_pct",   # the outcome
}
IRSD_CONSTITUENTS = {
    "median_hh_income_weekly", "unemployment_rate", "one_parent_family_pct",
    "no_qualification_pct", "persons_per_bedroom",
}

CALIPER_PCT = 80
STRATUM = "sa4_name"


def assert_no_leakage(features: list[str]) -> None:
    """Fail loudly rather than silently matching on something we intend to compare."""
    bad = set(features) & FORBIDDEN_IN_MATCHING
    if bad:
        raise ValueError(f"Matching features include variables under investigation: {sorted(bad)}")
    if "irsd_score" in features and (set(features) & IRSD_CONSTITUENTS):
        raise ValueError(
            "IRSD and its constituent Census variables cannot share a distance metric "
            f"(ADR-006). Offending overlap: {sorted(set(features) & IRSD_CONSTITUENTS)}")


def _distance(Z: np.ndarray, metric: str) -> np.ndarray:
    if metric == "euclidean":
        return np.linalg.norm(Z[:, None, :] - Z[None, :, :], axis=2)
    VI = np.linalg.pinv(np.cov(Z.T))
    diff = Z[:, None, :] - Z[None, :, :]
    return np.sqrt(np.abs(np.einsum("ijk,kl,ijl->ij", diff, VI, diff)))


def match(df: pd.DataFrame, features: list[str], *, metric: str = "mahalanobis",
          stratify: bool = True, caliper_pct: int | None = CALIPER_PCT,
          check_leakage: bool = True) -> pd.DataFrame:
    """
    Nearest-neighbour matching. Returns the frame with match columns attached.

    `match_idx` is -1 where no peer falls inside the caliper. A refusal is a
    legitimate result: a poor match is worse than none.
    """
    if check_leakage:
        assert_no_leakage(features)

    g = df.dropna(subset=features).reset_index(drop=True).copy()
    X = g[features]
    Z = ((X - X.mean()) / X.std()).values

    D = _distance(Z, metric)
    if stratify:
        s = g[STRATUM].to_numpy(dtype=object)
        D[s[:, None] != s[None, :]] = np.inf
    np.fill_diagonal(D, np.inf)

    idx, dist = D.argmin(axis=1), D.min(axis=1)
    finite = np.isfinite(dist)
    if caliper_pct is None:
        ok = finite
        cal = np.inf
    else:
        cal = float(np.percentile(dist[finite], caliper_pct))
        ok = finite & (dist <= cal)

    g["match_idx"] = np.where(ok, idx, -1)
    g["match_dist"] = np.where(ok, dist, np.nan)
    if ok.any():
        t1, t2 = np.percentile(dist[ok], [33, 66])
        g["match_strength"] = pd.cut(g.match_dist, [-1, t1, t2, np.inf],
                                     labels=["Strong", "Moderate", "Weak"]).astype(object)
    else:
        g["match_strength"] = None
    g.attrs["caliper"] = cal
    return g


def balance(g: pd.DataFrame, features: list[str]) -> pd.DataFrame:
    """
    Two balance views.

    `group_smd` is the standard covariate-balance metric. In a symmetric design
    where every unit is both a source and a match it is near-zero by construction
    and carries little information — see MODEL_EVOLUTION_LOG.
    `pair_smd` is the mean absolute within-pair difference in SD units, which is
    the diagnostic that actually discriminates here.
    """
    ok = g.match_idx >= 0
    src, tgt = g.index[ok], g.loc[ok, "match_idx"].astype(int)
    rows = []
    for f in features:
        a, b = g.loc[src, f].values, g.loc[tgt, f].values
        sd = np.sqrt((a.var() + b.var()) / 2)
        rows.append({"feature": f,
                     "group_smd": abs(a.mean() - b.mean()) / sd if sd else 0.0,
                     "pair_smd": float(np.mean(np.abs(a - b)) / g[f].std())})
    return pd.DataFrame(rows)


def stability(df: pd.DataFrame, features: list[str], *, jitter: float = 0.05,
              replicates: int = 25, seed: int = 42, **kw) -> float:
    """Share of communities keeping the same peer when inputs are perturbed."""
    rng = np.random.default_rng(seed)
    base = match(df, features, **kw)
    scores = []
    for _ in range(replicates):
        noisy = df.copy()
        for f in features:
            noisy[f] = noisy[f] + rng.normal(0, jitter * df[f].std(), len(df))
        alt = match(noisy, features, **kw)
        both = (base.match_idx >= 0) & (alt.match_idx >= 0)
        scores.append(float((base.loc[both, "match_idx"] == alt.loc[both, "match_idx"]).mean()))
    return float(np.mean(scores))


def irsd_validation(g: pd.DataFrame) -> dict:
    """
    IRSD is NOT a matching feature under M4, so agreement on it is out-of-sample
    evidence that the match captured socioeconomic similarity rather than being
    told the answer.
    """
    ok = g.match_idx >= 0
    src, tgt = g.index[ok], g.loc[ok, "match_idx"].astype(int)
    a, b = g.loc[src, "irsd_score"].values, g.loc[tgt, "irsd_score"].values
    da, db = g.loc[src, "irsd_decile_aus"].values, g.loc[tgt, "irsd_decile_aus"].values
    return {"mean_abs_irsd_gap": float(np.mean(np.abs(a - b))),
            "irsd_correlation": float(np.corrcoef(a, b)[0, 1]),
            "pct_within_one_decile": float(np.mean(np.abs(da - db) <= 1) * 100),
            "in_sample": False}
