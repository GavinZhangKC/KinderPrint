# Model evolution log

Each change records what triggered it, what changed, the evidence, and what was
kept deliberately. Models are area-level investigation aids. None predicts
anything for an individual child.

## Priority model (AEDC developmental vulnerability)

### V0: rule count (Iteration 1, August 2026)

**What it was.** Each community scored one point for every signal in its worst
quartile: vulnerability, IRSD, unemployment and one-parent families.

**Why it was dropped.** V0 correlated 0.795 with disadvantage. It re-drew the
SEIFA map and added nothing a practitioner did not already know.

### V1: weighted residual (30 August 2026, ADR-004)

**What changed.**

* Model: a linear regression of vulnerability on 3 features (IRSD, share of
  young children, IRSD spread), weighted by children assessed.
* z-score: z = residual / √(binomial SE² + in-sample residual SD²).
* Bands: pre-registered at 1.28 and 0.5.

**Evidence.**

* Correlation with disadvantage fell to 0.014.
* 20 of 342 communities were Higher.

**Kept.** The disadvantage guard (|ρ| ≤ 0.20) is a hard failure in the pipeline.

**Known weaknesses, recorded at the time and addressed in V2.**

* Expectations were in-sample.
* Only three features were used.
* The residual SD already contains sampling error, so adding the binomial SE
  counts that error twice. The resulting z-scores were too small.

### V2: out-of-fold expectations and an overdispersed funnel (30 September 2026, ADR-008)

**Triggers.**

* **Rubric requirement.** A model had to be validated beyond in-sample fit.
* **The known V1 weaknesses** listed above.
* **Coverage.** The KPI review found the V1 expectation ignored 7 case-mix
  variables already in the analytical table.

**What changed.**

* **Features.** 10 case-mix features.
* **Model choice.**
  * Candidates were a V1 replica, ridge regression and monotonic gradient
    boosting.
  * The selection rule was stated before any results were seen.
  * Ridge was selected: spatial-CV MAE 4.09 pp against 4.32 for the V1 replica
    and 4.45 for boosting.
* **Validation.** Expectations are out-of-fold under leave-one-SA4-out spatial CV,
  with nested tuning.
* **z-scores.** An additive random-effects funnel with a robust τ².
* **Stability.** Measured with 200 bootstrap refits.
* **Explanations.** Exact per-community driver contributions.
* **New checks.** Residual bias by IRSD quintile and by SA4, Moran's I of the
  residual, and BH-corrected tests of service access and environment against
  the residual.

**Evidence** (model card):

| Measure | Result |
|---|---|
| R² | 0.58 out-of-fold (V1 replica 0.53) |
| Calibration slope | 0.99 |
| Disadvantage guard | 0.013 |
| Stability | 38 of 42 Higher communities stable in ≥ 70% of refits |
| Residual bias | within ±0.7 pp in every IRSD quintile |

**Kept deliberately.**

* The pre-registered thresholds (1.28 and 0.5).
* Band-only publication (no numeric score in any API).
* The disadvantage guard.
* Case-mix-only adjustment. Service access is shown beside the band, never
  inside the expectation.

**Consequence.**

* The Higher band grows from 20 to 42 communities. 18 of V1's 20 remain.
* The threshold has not been tuned to restore a count. The band size goes to
  practitioner review (DS-18.1).
* V1 remains the published priority artefact until that review. V2 is served in
  the practitioner Brief with its evidence.

**Next (V3 candidates, not started).**

* A spatial random effect (BYM2) for the remaining residual clustering
  (I = 0.09).
* Add AEDC 2021 as a second cycle, to separate persistent from one-off
  exceedances.

## Access model

### A1: E2SFCA spatial access (30 September 2026)

**Trigger.** The practitioner view counted GP practices and ECEC services
*inside* each SA2 ("Service presence"). That count ignores cross-boundary use and
shared demand. It agrees only weakly with distance-weighted access (Spearman 0.38
for GPs and 0.41 for ECEC), so the count was misleading.

**What changed.**

* Method: enhanced two-step floating catchment with Gaussian decay and a 5 km
  primary catchment.
* Sensitivity: 3 km and 10 km catchments.
* Demand: every projected SA2 around the scope, which avoids edge inflation.

**Evidence.**

* **Conservation test.** The access-weighted population equals total supply.
* **Catchment sensitivity.** Spearman 0.81 between 3 km and 5 km, and 0.68
  between 5 km and 10 km (GP).
* **Equity** (population-weighted Gini at 5 km): 0.23 for GP and 0.23 for ECEC.
* **Where low GP access falls.** 36% of residents in IRSD quintile 2 and 30% in
  quintile 3 live in the lowest-access fifth of SA2s, against 6% in quintile 1
  (the most disadvantaged). The lowest-access SA2s are growth corridors (Manor
  Lakes, Fraser Rise, Wyndham Vale, Rockbank, Tarneit, Wollert, Clyde North) and
  the peri-urban fringe. For fringe SA2s the figure is a lower bound, because
  practices outside Greater Melbourne are not in the supply file (edge effect).
