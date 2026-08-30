# Model Evolution Log

Every version records the requirement it served, the method, the evaluation, the
problem that surfaced, and the change it triggered. Entries are written in the
same commit as the model change; git history corroborates the dates.

---

## Priority Discovery

### V0 — Percentile-threshold overlap · 30 Aug 2026 · **Rejected**

**Requirement:** identify communities where multiple concerning signals overlap.

**Method:** count how many of four indicators (AEDC vulnerability, IRSD, unemployment,
one-parent families) fall past the 75th percentile in the concerning direction.
Band by count: 0–1 Lower, 2 Moderate, 3–4 Higher.

**Features:** `vulnerable_pct`, `irsd_score`, `unemployment_rate`, `one_parent_family_pct`

**Evaluation:** Spearman correlation with disadvantage (−IRSD) = **0.795**.
Distribution: Lower 251, Moderate 25, Higher 66.

**Problem identified:** V0 is a disadvantage map. Three of its four inputs are
measures of disadvantage, and the fourth correlates −0.65 with the first. It tells a
practitioner that poor areas have poor outcomes, which they already know. The project
brief states explicitly that KinderPrint "must NOT become another map showing
disadvantaged suburbs."

**Change:** rejected in favour of a residual approach.

**Reason:** the trigger is measured, not asserted. A correlation of 0.795 means the
index is close to a monotone transform of IRSD.

---

### V1 — Child-count-weighted residual model · 30 Aug 2026 · **Adopted**

**Requirement changed to:** identify communities whose child-development outcomes are
worse than their socioeconomic position predicts. This asks a question the practitioner
cannot answer from a SEIFA map.

**Method:** weighted least squares of AEDC vulnerability on socioeconomic and
demographic position; rank by standardised residual. Weights are children assessed, so
a community with 40 children influences the fit less than one with 400. The residual is
standardised against both model error and binomial sampling error, so small communities
are not flagged merely for being noisy.

**Features:** `irsd_score`, `children_0_4_pct`, `irsd_sa1_spread`

`irsd_sa1_spread` (max minus min SA1 IRSD within the community) captures within-community
inequality, which the SA2-level IRSD score cannot express.

**Parameters:** intercept 20.266; irsd_score −5.202; children_0_4_pct +1.841;
irsd_sa1_spread +0.171 (standardised). Weighted R² = 0.551.

**Bands (ADR-004, pre-registered before environmental results were seen):**
Higher z ≥ 1.28 (n=20), Moderate 0.5 ≤ z < 1.28 (n=67), Lower z < 0.5 (n=255).

**Evaluation:**

| Metric | V0 | V1 |
|---|---|---|
| Spearman vs disadvantage | 0.795 | **0.014** |
| Top-20 overlap with the other version | — | **2 / 20** |

The two methods identify almost entirely different communities. V1 surfaces Toorak
(IRSD decile 10, 26% vulnerability), which no disadvantage-driven method would flag.

**Regression guard:** `scripts/refresh_data.py` aborts the pipeline if the V1
correlation with disadvantage ever exceeds 0.20. Enforced again in
`tests/test_analytics.py::test_v1_is_not_a_disadvantage_map`.

**Open:** spatial block cross-validation pending the Moran's I result (DS-08.3). If
AEDC vulnerability is spatially clustered, random k-fold would leak between adjacent
communities.

---

## Community Matching

### M0 — Unscaled Euclidean KNN · **Superseded**

**Method:** nearest neighbour on raw feature values, k=1.
**Evaluation:** max SMD 0.045, mean 0.023, coverage 100%.
**Problem:** distance is dominated by large-scale features. Median household income
spans thousands; `children_0_4_pct` spans single digits. The metric is effectively
income-only.
**Change:** standardise all features.

### M1 — Standardised Euclidean · **Superseded**

**Method:** z-score every feature, then nearest neighbour.
**Evaluation:** max SMD 0.025, mean 0.010, coverage 100%.
**Problem:** correlated covariates are double-counted. IRSD, income and unemployment
measure overlapping constructs, so Euclidean distance weights that construct three times.
**Change:** move to a covariance-aware metric.

### M2 — Mahalanobis · **Superseded**

**Method:** Mahalanobis distance using the inverse covariance of the standardised features.
**Evaluation:** max SMD 0.064, mean 0.038, coverage 100%.
**Problem:** pairs are socioeconomically plausible but geographically arbitrary. With no
spatial constraint, a coastal community can be matched to an inland one; the subsequent
environmental comparison then recovers geography rather than anything actionable.
**Change:** stratify.

### M3 — Mahalanobis stratified within SA4, with caliper · **Adopted**

**Method:** exact match on SA4, then Mahalanobis nearest neighbour, then a caliper at the
80th percentile of within-SA4 distances (1.472). Pairs beyond the caliper return
`no_match`.

**Evaluation:** max SMD 0.025, mean 0.014, coverage **79.8%** (273 of 342),
`no_match` **69 communities (20.2%)**.

**Why coverage fell and that is correct:** returning a poor match is worse than
returning none. `no_match` is a supported result in the API contract and rendered in
the UI.

**Sample pairs:** Collingwood ↔ Fitzroy · Belgrave-Selby ↔ Upwey-Tecoma ·
Glenroy East ↔ Hadfield · Hallam ↔ Hampton Park West. All geographically and
socially plausible.

---

## Evaluation-metric change

**Aggregate standardised mean difference was abandoned as the primary diagnostic.**

Across M0–M3, SMD ranged only 0.025–0.064, and M2 scored *worse* than M1 despite being
methodologically better. The reason is structural: in a symmetric 1:1 design where every
community is both a source and a match, the source group and match group contain the same
units, so their means are near-identical by construction. SMD is designed for
treated-versus-control comparisons where the groups are genuinely distinct.

**Replaced with:** per-pair distance distribution, match coverage, `no_match` rate,
geographic plausibility review, and stability under feature-set and scaler perturbation
(DS-16.1, pending).

This is the kind of failure that only appears when a metric is imported from a different
design. Recorded here because rejecting an inappropriate metric is a modelling decision.

---

## Uncertainty layer (added, not a version change)

Because AEDC publishes child counts, every matched-pair difference now carries a
significance state (two-proportion z-test) and a Wilson 95% interval.

- 273 pairs tested; **69 significant (25.3%)**, 204 not (74.7%)
- Among Higher-priority communities the ratio inverts: **11 of 17 significant**
- Median community has 122 children assessed → 95% interval ≈ ±7 percentage points

Without this, roughly three quarters of what the product displayed would have been
sampling noise presented as findings.

Note on method: non-overlapping intervals imply significance (0 violations in 273
pairs), but the converse does not hold — 38 pairs are significant while their intervals
overlap. Comparing two intervals is more conservative than testing the difference
directly. Asserted in the correct direction only, in
`tests/test_analytics.py::test_non_overlapping_intervals_always_imply_significance`.

---

## Deployment defects

| Date | Defect | Detection | Fix |
|---|---|---|---|
| 30 Aug 2026 | Environmental indicators marked `available` while `value` was null | Backend's `validation.py` rejected all 346 profiles | `NaN is not None` is `True` in Python. Normalise the value first, judge availability after |
| 30 Aug 2026 | Handover v1 delivered as CSV + PostgreSQL DDL | Read the backend source | Service reads five JSON files from env paths. Rebuilt as JSON |
| 30 Aug 2026 | `neighbourhood_id` would have contained `/` for merged areas | Read the FastAPI route definitions | Underscore-joined component codes |

---

## Planned

| Version | Trigger | Timing |
|---|---|---|
| V2 | Practitioner feedback from the user evaluation (DS-18.1) | Week 11 |
| M4 | Match stability results from sensitivity analysis (DS-16.1) | Week 11 |
| Environment layer | Cooling & Greening Melbourne datasets integrated | Week 9 |

---

### M4 — Mahalanobis, SA4-stratified, IRSD removed · 30 Aug 2026 · **Adopted**

**Trigger:** not a metric this time — an **audit finding**. The shipping matching
feature set contained `irsd_score` alongside `median_hh_income_weekly`,
`unemployment_rate` and `one_parent_family_pct`, which IRSD is constructed from. That
contradicted the project's own stated leakage rule. Measured VIF for `irsd_score` was
9.43; correlation with income +0.83.

**Complication:** Mahalanobis distance already corrects for covariance, so the
violation might have been theoretical. Tested rather than assumed.

**Evaluation:** three candidate feature sets compared on collinearity, group and
per-pair balance, jitter stability (5%, 25 replicates), leave-one-feature-out
stability and coverage. Full table in ADR-006.

| Metric | M3 | M4 |
|---|---|---|
| max VIF | 9.43 | 4.13 |
| condition number | 45.7 | 29.5 |
| max group SMD | 0.025 | 0.021 |
| jitter stability | 76.2% | 79.2% |
| IRSD correlation between peers | 0.948 (in-sample) | **0.889 (out-of-sample)** |
| peers within one IRSD decile | 82.4% (in-sample) | **74.7% (out-of-sample)** |

**Unanticipated benefit:** removing IRSD converts it from an input into a validation
measure. M4 reproduces IRSD similarity between peers *without being given IRSD*,
which is genuine evidence the match captures socioeconomic similarity rather than
being handed the answer. Under M3 that agreement was circular.

**Result:** adopted. 42% of pairs changed. Significant AEDC differences 69 → 61;
environmental difference records 798 → 792. Enforced by `assert_no_leakage()` and
three tests, one of which asserts M3's feature set is *rejected*.

**Reflection:** the rule was written before the metric was chosen, and Mahalanobis
made it partly redundant. Testing rather than blindly applying it produced a better
justification than compliance alone would have — and a validation measure that did
not exist before.
