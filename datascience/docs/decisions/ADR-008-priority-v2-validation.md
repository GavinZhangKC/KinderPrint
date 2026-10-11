# ADR-008: Priority model V2, out-of-fold expectations and spatial validation

**Date:** 2026-09-30 · **Status:** Accepted (serving in the practitioner Brief; V1 remains the published priority artefact pending DS-18.1) · **Owner:** MDS lead

## Context

V1 (ADR-004) produced its expectations in-sample from three features. Its
z-scores double-counted sampling error. A rubric review asked for model
comparison, validation that respects geography, calibration, bias checks and
explanations.

## Decisions (fixed before results were examined)

1. **Adjust for population composition only.** Service access and environment
   are not adjusters. They are shown beside the band and tested against the
   residual.
2. **Validate by region.** Leave-one-SA4-out spatial CV provides the expectations
   and the headline metrics. Tuning is nested inside training folds.
3. **Compare three models.** A V1 replica, ridge regression, and gradient
   boosting with monotonic constraints. Boosting is chosen only if its MAE is at
   least 3% better and its calibration slope is within 0.9-1.1.
4. **Use an additive random-effects funnel.** τ² is set so the robust spread of
   the z-scores is 1. The DerSimonian-Laird value is reported for comparison.
5. **Keep the pre-registered thresholds** (z ≥ 1.28 Higher, ≥ 0.5 Moderate).
6. **Publish bands only.** Every band carries its evidence: observed share,
   expected range at the Higher threshold, drivers and band stability.
7. **Explanations come from the model that made the number** (added 12 October
   2026). Drivers are taken from each community's held-out fold model;
   reference + sum of contributions must equal the published expectation
   within 0.01 pp or the run fails.
8. **Stability repeats the spatial holdout** (added 12 October 2026). The
   served stability share is an SA4 block bootstrap of the leave-one-SA4-out
   procedure. The earlier IID refit check is kept, labelled "IID refit
   stability (does not reproduce the spatial holdout)".

## Outcome

Ridge was selected: MAE 4.09 pp, R² 0.58, calibration slope 0.99. Gradient
boosting was 8.8% worse. See MODEL_CARD_PRIORITY_V2.md.

## Explanation fidelity (review, 12 October 2026)

An independent review found the drivers were computed from the model fitted to
all communities, not from the fold model behind each published expectation.

| | Mean abs gap (pp) | Max gap (pp) | Communities > 1 pp |
|---|---|---|---|
| Before: full-data model, against published expected values | 0.43 | 3.22 | 32 |
| After: held-out fold model | 1.2e-15 | 7.1e-15 | 0 (0 above 0.01 pp) |

Bands and expected values did not change. Stability under the SA4 block
bootstrap: 35 of 42 Higher communities stable in ≥ 70% of 200 replicates
(IID refit: 38 of 42).

## Consequences

* 42 communities are Higher, against 20 in V1. 18 of V1's 20 are retained.
* The count is not tuned. Practitioner review (DS-18.1) decides whether V2
  replaces V1 in the priority artefact, and whether the band size needs a
  documented V3 change.
* The pipeline tests enforce: calibration slope 0.9-1.1, the disadvantage guard,
  residual bias under 1.5 pp by IRSD quintile, at least 75% of Higher
  communities stable, "Higher ⇔ observed above the expected range", and
  explanations that reconstruct every published expectation within 0.01 pp.
