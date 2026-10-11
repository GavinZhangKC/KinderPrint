# Model card: Priority model V2 (expected vs observed developmental vulnerability)

| | |
|---|---|
| Version | V2-M2, 30 September 2026 (supersedes V1 of 30 August 2026; see MODEL_EVOLUTION_LOG.md) |
| Code | `scripts/model_expected_vulnerability.py`, `scripts/build_practitioner_context.py` |
| Outputs | `data/processed/expected_vulnerability_community.csv`, `data/processed/practitioner_context_sa2.csv`, `reports/iteration3/model_expected_vulnerability.json`, `reports/iteration3/model_expected_vulnerability_contributions.csv`, `reports/iteration3/figures/v2_*.png` |
| Served by | `GET /api/digital-health/practitioner-context?sa2_code=` (Practitioner view → Brief) |
| Tests | `tests/test_models_iteration3.py` (15), `tests/test_priority_v2_explanations.py` (9), `backend/tests/test_care_context.py` (4 new) |

## Intended use

The model answers one question: given who lives in a community, where is the
share of children developmentally vulnerable on one or more AEDC domains clearly
**higher than we would expect**?

* **Users.** Maternal and child health, early years and council practitioners
  deciding where to look first.
* **Output.** A band (Higher, Moderate or Lower). Beside it: the observed share,
  the expected range, the three biggest drivers of the expectation, and how
  stable the band is.
* **Not for:**
  * judging a service, a kindergarten or a school
  * predicting anything about an individual child
  * funding formulas
  * ranking suburbs for families

  The parent view does not show the band.

## Data

| Item | Detail |
|---|---|
| Unit | 342 AEDC communities in Greater Melbourne (one or more SA2s; 4 SA2s have no published AEDC result) |
| Outcome | % of children developmentally vulnerable on ≥ 1 domain, AEDC 2024 |
| Weight | Children assessed (median 122, range 16 to 1,025) |
| Features (10) | IRSD score, IRSD spread across SA1s, unemployment rate, one-parent families, adults without qualifications, median household income, persons per bedroom, household size, median age, share of children aged 0-4 (Census 2021, SEIFA 2021) |
| Not used as adjusters | GP and ECEC access, vegetation, open space, heat, PM2.5 (see "Design choice" below) |

**Design choice: population composition only.** A variable that services could
change (such as access to early learning) is deliberately not in the
expectation. If it were, an area with poor access would have a high expected
value, look "as expected", and drop off the shortlist, which hides the very gap
a practitioner should see. Those variables are tested afterwards against the
residual.

## Models compared and how they were validated

All three models are weighted by the number of children assessed.

**Primary scheme: leave-one-SA4-out spatial cross-validation (9 folds).** Each
expectation comes from a model that saw neither the community nor its region.
Ridge and gradient-boosting settings were tuned inside each training fold with
SA4-grouped CV (nested). Random 10-fold results are shown for contrast.

| Model | Spatial CV MAE (pp) | RMSE (pp) | R² | Calibration slope | Random 10-fold MAE |
|---|---|---|---|---|---|
| M0 null (weighted mean) | 6.38 | – | 0 | – | – |
| M1 V1 replica: linear, 3 features | 4.32 | 5.55 | 0.53 | 0.99 | 4.25 |
| **M2 ridge, 10 features (selected)** | **4.09** | **5.26** | **0.58** | **0.99** | 4.10 |
| M3 gradient boosting, monotonic constraints | 4.45 | 5.63 | 0.51 | 0.94 | 4.41 |

**Selection rule, fixed before results were seen.** Gradient boosting is chosen
only if its spatial-CV MAE is at least 3% below the best linear model and its
calibration slope is within 0.9-1.1.

* Gradient boosting was 8.8% *worse*, so the ridge model was kept (α = 10; α was
  10 in 7 of the 9 outer folds).
* With 342 areas and mostly smooth relationships, the extra flexibility adds
  variance, not signal.

**Leakage check.** Random and spatial CV give almost the same MAE (4.10 vs
4.09). The case-mix relationships therefore transfer across regions, and the
spatial scores are not flattered by neighbouring areas.

## Turning residuals into bands

* **z-score.** z = (O − E) / √(E(1 − E)/n + τ²): an additive random-effects
  funnel (Spiegelhalter 2005).
* **τ² (between-community variance, 0.0016).** Set so the central bulk of
  z-scores has unit spread (MAD-based SD = 1.00; overall SD = 1.04).
* **Why not the standard estimate.** The winsorised DerSimonian-Laird estimate is
  0.00065. It was rejected because it left the z-scores over-dispersed (SD 1.28),
  which would flag too many areas.
* **Bands.** The pre-registered V1 thresholds are kept unchanged (ADR-004):
  Higher z ≥ 1.28, Moderate 0.5 ≤ z < 1.28, Lower z < 0.5.
* **Published range.** The expected range is E ± 1.28 × SE. "Higher" therefore
  always means "observed above the top of the range", and a test checks this.

## Results

| | |
|---|---|
| Bands | Higher 42 · Moderate 56 · Lower 244 |
| Stability (SA4 block bootstrap, published as `band_stability`) | 35 of 42 Higher communities are Higher in ≥ 70% of 200 replicates (median 95%). Median 5th-95th percentile width of the out-of-fold expectation: 3.26 pp (90th percentile 6.22, max 13.65) |
| Stability (IID refit, secondary) | 38 of 42 Higher communities in ≥ 70% of 200 refits (median 96%). Labelled "IID refit stability (does not reproduce the spatial holdout)" |
| Disadvantage guard | \|Spearman(z, −IRSD)\| = 0.013 (limit 0.20): the shortlist is not a map of disadvantage |
| Agreement with V1 | Spearman of z-scores 0.94. 18 of V1's 20 Higher communities stay Higher, and 23 V1-Moderate communities move up. V2 publishes more Higher areas because V1 divided by the in-sample residual SD, which double-counted sampling error. |
| Spatial structure | Moran's I (k = 6) falls from 0.40 on the outcome to 0.09 on the residual (p = 0.002). Some regional clustering remains (see limitations). |
| Main drivers of the expectation (mean absolute effect, from held-out fold models) | Adults without qualifications 1.88 pp · median age 1.82 · IRSD 1.25 · unemployment 1.03 · household size 0.72 · crowding 0.71 |

## Explanation fidelity

The drivers shown beside a band must explain the expectation that is shown.

* **Before (to 1 October 2026).** Expectations were out-of-fold, but driver
  contributions were taken from the ridge model refitted to all 342
  communities. They explained a different number. Against the published
  expected values: mean absolute gap 0.43 pp, max 3.22 pp, 32 communities over
  1 pp (unrounded: 0.4305, 3.2132 and 33).
* **After.** Each community's contributions come from the held-out fold model
  that produced its expectation. The reference value is that fold model's
  prediction at the child-weighted mean of its training communities, so
  reference + sum of contributions = expected value. Reconciliation over 342
  communities: max gap 7.1e-15 pp, mean 1.2e-15 pp, 0 above the 0.01 pp
  tolerance. The script stops if any community exceeds the tolerance.
* **Where to check.** `explanation_reconciliation` in the JSON report, and the
  per-community reference value, held-out SA4 and contributions in
  `reports/iteration3/model_expected_vulnerability_contributions.csv`.
* **Effect.** Bands, expected values and ranges are unchanged. Driver text
  changed for 341 of 342 communities (mostly small changes in the stated pp).

## Band stability

* **Published (`band_stability`): SA4 block bootstrap.** Each of 200
  replicates draws the 9 SA4s with replacement as whole blocks. For every
  original SA4 the ridge model is refitted on the drawn blocks other than that
  SA4, with α re-tuned by inner SA4-grouped CV, and that SA4's communities are
  predicted out of fold. τ², z-scores and bands are recomputed per replicate.
  This repeats the spatial holdout that produces the published expectations.
* **Secondary: IID refit stability (does not reproduce the spatial holdout).**
  The earlier check: communities resampled independently, model refitted with
  fixed α, every community predicted by a refit that usually saw it. Kept in
  the community CSV (`higher_band_iid_refit_share`) and the report for
  comparison only.
* **Results.** Spatial: 35 of 42 Higher stable in ≥ 70% of replicates (median
  share 95%). IID: 38 of 42 (median 96%). The spatial measure is slightly less
  stable, as expected with only 9 blocks. Both meet the 75% test.

## Fairness and bias checks

* **Mean out-of-fold residual by IRSD quintile:**

  | Quintile | 1 (most disadvantaged) | 2 | 3 | 4 | 5 |
  |---|---|---|---|---|---|
  | Mean residual (pp) | +0.35 | +0.65 | −0.64 | −0.34 | +0.13 |

  Every quintile is within ±0.7 pp, below the 1.5 pp test limit. The model does
  not systematically under- or over-expect by disadvantage.

* **Higher-band share by quintile:** 17%, 10%, 4%, 10%, 19%.
  * Higher areas appear at both ends of disadvantage. This includes advantaged
    areas where vulnerability is well above expectation, which a disadvantage map
    would miss.
  * The dip in quintile 3 is examined in the limitations below.

* **By SA4, mean residual within ±1.1 pp except North East (−2.3 pp).** North
  East communities do better than their composition predicts. That is a regional
  pattern worth reporting, not a fault to be tuned away.

## Do service access or environment explain the residual?

For each context variable we took the Spearman correlation with the out-of-fold
residual, then applied a Benjamini-Hochberg correction across the 7 tests.

| Context variable | Spearman correlation | q-value |
|---|---|---|
| GP access (E2SFCA 5 km) | 0.05 | 0.84 |
| ECEC places access | −0.02 | 0.89 |
| Distance to nearest ECEC | 0.00 | 0.94 |
| Vegetation | −0.03 | 0.84 |
| Open space | −0.07 | 0.84 |
| Heat island | −0.04 | 0.84 |
| PM2.5 | 0.03 | 0.84 |

None is associated with being above or below expectation at area level. So a
practitioner cannot assume a Higher area is explained by poor GP or kindergarten
access. The card shows access alongside so this can be checked locally.

## Limitations

* **Ecological.** Area results say nothing about individual children or
  families.
* **Small cohorts.** The funnel handles chance, but a Higher band in a small
  community (the smallest Higher community has 23 children) needs local
  confirmation.
* **Two time points.** The outcome is AEDC 2024; the features are Census 2021.
  Fast-growing areas may have changed.
* **Remaining regional clustering.** Moran's I on the residual is 0.09. A spatial
  random effect (e.g. BYM2) is the next step if practitioners confirm the
  shortlist is useful.
* **Merged communities.** 13 AEDC communities combine SA2s. Their results apply
  to the merged area.
* **Threshold not yet reviewed.** V2 flags 42 Higher areas against V1's
  selective 20. ADR-004 says the band size is reviewed with practitioner feedback
  (DS-18.1). The threshold has not been tuned to hit a count.

## Figures (alt text)

* `v2_calibration.png`: Scatter of mean observed against mean expected
  vulnerability for 10 deciles of communities. The points lie close to the
  diagonal from 12% to 33% (calibration slope 0.99), so out-of-fold expectations
  are well calibrated across the range.
* `v2_funnel.png`: Observed-minus-expected percentage points against children
  assessed. The limits for z = 1.28 and z = 1.96 narrow as cohorts grow. Higher
  communities (red triangles) sit above the upper dashed limit and are mostly
  cohorts of 50-200 children. Two large communities of about 310 and 550
  children are also Higher.
* `v2_importance.png`: Horizontal bars of the mean absolute effect of each
  feature on the expectation, taken from each community's held-out fold model.
  Adults without qualifications (1.88 pp), median age (1.82) and area
  disadvantage (1.25) matter most; one-parent families and spread of
  disadvantage matter least.
