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
   expected range at the Higher threshold, drivers and bootstrap stability.

## Outcome

Ridge was selected: MAE 4.09 pp, R² 0.58, calibration slope 0.99. Gradient
boosting was 8.8% worse. See MODEL_CARD_PRIORITY_V2.md.

## Consequences

* 42 communities are Higher, against 20 in V1. 18 of V1's 20 are retained.
* The count is not tuned. Practitioner review (DS-18.1) decides whether V2
  replaces V1 in the priority artefact, and whether the band size needs a
  documented V3 change.
* The pipeline tests enforce: calibration slope 0.9-1.1, the disadvantage guard,
  residual bias under 1.5 pp by IRSD quintile, at least 75% of Higher
  communities stable, and "Higher ⇔ observed above the expected range".
