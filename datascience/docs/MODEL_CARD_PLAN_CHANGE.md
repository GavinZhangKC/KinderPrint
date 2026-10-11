# Model card: Plan a change (P2 matched-pair analogues)

| | |
|---|---|
| Version | P2, 11 October 2026. Replaces the in-browser straight-line model on the Simulation page (P0) |
| Code | `src/kinderprint/analytics/plan_change.py` (pure Python), `scripts/build_plan_change.py` |
| Output | `outputs/iteration_3/plan_change.json` |
| Report | `reports/plan_change/plan_change_validation.json` |
| Served by | `GET /api/plan-change/setup`, `/areas/{id}`, `/evaluate` (`backend/loaders/plan_change.py`, a verbatim copy of the engine). Page: `/simulation` ("Plan a change") |
| Tests | `datascience/tests/test_plan_change.py` (14), `backend/tests/test_plan_change.py` (21) |
| Decision record | `decisions/ADR-010-plan-a-change.md` |

## Question it answers

"If this area had more tree cover, cooler streets, more open space or less
main-road traffic, how do children fare in similar areas that already look like
that?"

It does not answer "what will happen if we make this change". It compares
areas; it is not a causal estimate.

## Intended use

**Users.** Practitioners and planners. A simpler parent view shows the same
result in words.

**Not for:**

* predicting an individual child;
* promising an effect of greening or traffic works;
* ranking councils or streets.

## Method

1. **Plan.** One or two place features are changed:
   * tree cover in percentage points;
   * urban heat in °C;
   * open space in percentage points;
   * main-road traffic in percent.
2. **Scale.** Every feature and covariate is converted to a Greater Melbourne
   percentile, so skewed measures such as traffic do not dominate.
3. **Two pools of other areas.** Each pool is within 40 percentile points of
   this area on IRSD and children assessed (the caliper).
   * *Like the plan:* the planned features are within ±10 points of the planned
     level.
   * *Like now:* the planned features are within ±10 points of today's level.
4. **Matched pairs.** Each plan-like area is paired with the unused now-like
   area closest to it on IRSD and children assessed, within 10 points. The
   engine keeps up to 12 pairs and needs at least 5.
5. **Estimate.** The mean paired gap is calculated for two outcomes:
   * AEDC all five domains on track;
   * AEDC physical health on track.

   Both use 2024 shares adjusted for small numbers of children.
6. **Uncertainty.** A deterministic bootstrap over pairs gives an 80% interval.
   The interval is widened by a factor calibrated on shuffled data (below). A
   direction is called clear only when the interval excludes zero.
7. **Balance check.** If the two groups' standardised mean difference on IRSD
   or children is above 0.25, the page adds a caution.
8. **Context.** The area's 2027 school-entry outlook from forecast F3 is shown
   beside the result, unchanged.

## Validation (published report)

| Check | Result |
|---|---|
| P0 audit: straight-line tree-cover slope | 3.48 pp per SD without IRSD, 1.20 with IRSD: 65.5% of the old slope was disadvantage |
| Coverage across 346 areas × 7 ready-made plans | 71.1% have a result (gate ≥ 60%) |
| Balance | 90.5% of results have balanced groups (gate ≥ 80%) |
| Placebo: features shuffled across areas | 25.7% "clear" before calibration; intervals widened ×1.158, giving 19.7% (chance is 20%) |
| Real data, calibrated | 24.4% "clear" overall: trees +10 points 32.8%, trees +5 points 28.3%, open space +3 points 25.6%, cooler 1 °C 18.5%, half the traffic 18.6% |
| Sensitivity: band 7/13, pairs 8/16, pair caliper 7/13 | 99.7–100% of clear results never reverse direction; overall direction agreement 76–92% |
| Reproducibility | Identical output on repeat runs (gate) |
| Parity | The backend reproduces all 21 reference searches exactly (Brunswick East, Footscray, Box Hill × 7 plans) |

**Reading the results honestly.** Only tree cover shows clearly more signal
than chance. Results for heat and traffic are close to the shuffled baseline,
so the page usually says "no clear difference" for them. That is the finding,
not a fault.

## Limitations

* **Association across areas, not cause.** IRSD and children assessed are
  matched; anything else that differs between areas is not.
* **Ageing data.** Place features date from 2018–2019; outcomes are from 2024.
* **Area averages.** Streets inside an area differ.
* **Not enough similar areas.** About 29% of area-plan combinations have too
  few similar areas. The page says so instead of guessing.
* **Combined plans have low coverage** (27.7% for greener and cooler).

## Refresh

Rebuild with `python3 scripts/build_plan_change.py`. The script exits 1, and
writes nothing, if any gate fails.
