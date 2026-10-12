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
* **Stability.** Measured with 200 bootstrap refits (since 12 October 2026,
  an SA4 block bootstrap; see below).
* **Explanations.** Exact per-community driver contributions (since 12 October
  2026, from each community's held-out fold model; see below).
* **New checks.** Residual bias by IRSD quintile and by SA4, Moran's I of the
  residual, and BH-corrected tests of service access and environment against
  the residual.

**Evidence** (model card):

| Measure | Result |
|---|---|
| R² | 0.58 out-of-fold (V1 replica 0.53) |
| Calibration slope | 0.99 |
| Disadvantage guard | 0.013 |
| Stability | 35 of 42 Higher communities stable in ≥ 70% of SA4 block-bootstrap replicates (IID refit: 38 of 42) |
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

**Explanation fidelity (V2 fix, 12 October 2026).**

* **Problem.** Expectations were out-of-fold, but driver contributions came
  from the model fitted to all communities. Against published expected values:
  mean gap 0.43 pp, max 3.22 pp, 32 of 342 communities over 1 pp.
* **Fix.** Contributions and the reference value now come from each
  community's held-out fold model. Reconstruction gap: max 7.1e-15 pp, 0 of 342
  above 0.01 pp. The script asserts this; the report carries
  `explanation_reconciliation`.
* **Stability.** The served share is now an SA4 block bootstrap that repeats
  the spatial holdout with re-tuning (35 of 42 Higher stable, median 95%). The
  earlier check is kept as "IID refit stability (does not reproduce the
  spatial holdout)" (38 of 42, median 96%).
* Bands and expected values are unchanged.

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

## Family Fit ("Where to live")

### S0: suitability finder (Iteration 2)

A modal on the map page. The parent ticked criteria, and the finder averaged
each area's criterion values into a 0–100 score.

**Problems found (9 October 2026).**

* **Mixed scales.** Raw percentages sat beside percentile ranks. In a "shade +
  healthcare" search, GP and pharmacy access drove 94.2% of the score variance.
* **Border effects.** Services were counted only inside each border, so 20
  areas with no GP inside their border scored 0, even though 16 of them have a
  GP nearby (median 2.08 km).
* **Small numbers.** AEDC shares from areas with few children were used raw.
* **No explanation.** The finder gave no reasons, uncertainty or limitations.
  Tutor and design feedback: wording ("Ready for school", "Improving") promised
  more than the data shows.

### S2: Family Fit (shipped, S2.1)

* **Needs.** Eight child-focused needs, two measures each, as
  direction-aligned percentiles.
* **AEDC.** Empirical-Bayes shrinkage.
* **Services.** E2SFCA access across borders.
* **Essential.** The Melbourne median or better (weight 2). Prefer has weight 1.
* **Stability.** A Monte Carlo label for shortlist position. Corrected on
  12 October 2026 after an independent review: each draw now reruns the whole
  search (Essential thresholds included), so areas can enter and leave. Before
  the fix, a review search showed 100% where the full search gives 62.5%.
* **Gates.** Nine blocking gates.

**Evidence.**

* Each measure carries 22.6–29.3% of the variance.
* Small-numbers backtest: 7.9–9.9% lower error overall, 15–22% lower for small
  areas.
* Top-10 Jaccard under threshold and weight changes: 0.67–1.0.
* The API reproduces the reference rankings exactly.

**Design changes from feedback.**

* Neutral rank circles, with a separate reliability label.
* "Stable shortlist position", scoped to school-entry measures.
* "Improving" names the measure and the years (2015 to 2024) and uses a
  significance test.
* Childcare is described as capacity, not vacancies.
* The match score is described as a comparative index, not a probability.
* Suggestions are always "Prefer". An Essential is never relaxed silently; the
  no-results state offers named relaxations, each with its result count.

**Out of scope by decision.** Rent and housing cost, which would move the
product away from its child-health niche.

### Forecast: F0 → F3 (2027 school-entry outlook)

Rolling-origin design: train on 2012→15, 15→18 and 18→21; hold out 21→24.

| Step | Change | Weighted MAE (pp) |
|---|---|---|
| F0 | Persistence (last observed share) | 7.56 |
| F1 | Shrunk persistence | 7.01 |
| F2 | F1 plus the Melbourne trend | 6.90 |
| F3 v1 | Ridge on absolute shares | Reverted toward the historical mean; rejected |
| **F3** | **Ridge on position relative to Melbourne (alpha grid widened to 100,000)** | **6.43 (selected; 14.9% better than F0; Spearman 0.65)** |
| F4 | Gradient boosting, same features | 6.88 (not selected; worse, and 80% coverage 0.58) |

* Holdout 80% coverage for F3 is 0.70, because Greater Melbourne fell 3.5 pp in
  2024.
* The published 2027 intervals add a cycle-shock variance of 1.80 pp, estimated
  from all four transitions.

#### Validation design and limits

* The table above uses 21→24 both to choose and to score, so it is a
  validation result. A nested chronological evaluation was added
  (`chronological_evaluation` in the report): choose on 18→21 after training on
  12→15 and 15→18 (alpha tuned inside training), then score once on 21→24.
* Validation chose F3 (5.27 pp; F4 5.46, F1 6.22, F0 6.73). Untouched test:
  F3 6.43 pp vs persistence 7.56 pp, Spearman 0.65 vs 0.51, bias +3.48 pp
  (over-prediction).
* With interval SD from past-only out-of-time residuals, F3 covered 69.9%
  (nominal 80%, mean width 17.9 pp) and 88.9% (nominal 95%, mean width
  27.4 pp). Persistence covered 73.1% and 90.1%.
* The common-shift adjusted error (5.68 pp) is a diagnostic, not operational
  performance.
* IRSD 2021 is reused for every origin. The test is one transition (342 areas
  sharing one shift). The 2027 cycle-shock term was estimated after seeing 2024,
  so the 2027 range is labelled "nominal 80% range (coverage not yet
  demonstrated)" and the outlook is exploratory.

### Plan a change: P0 → P2 (Simulation page)

| Step | Change | Trigger or result |
|---|---|---|
| P0 | Least squares of AEDC on five place features, fitted in the browser | Tree-cover slope 3.48 pp/SD fell to 1.20 once IRSD was added (65.5% was disadvantage); it extrapolated beyond observed areas |
| P1 | Two independent nearest-neighbour groups (like the plan, like now), similar to this area on IRSD, children and all other features | Coverage only 1% when matching on five dimensions; balanced in about 25% of results |
| P2 v1 | 1:1 matched pairs on IRSD and children only | Coverage 71.1%, balance 90.5%; placebo "clear" rate 25.7%, above the 20% expected |
| **P2** | **Interval widened ×1.158, calibrated on shuffled data** | **Placebo 19.7%; real 24.4%. Clearest for tree cover (+10 points: 32.8%)** |
