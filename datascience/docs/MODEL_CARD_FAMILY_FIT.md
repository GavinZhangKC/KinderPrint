# Model card: Family Fit S2 ("Where to live") and the 2027 school-entry outlook

| | |
|---|---|
| Version | S2.1 (engine) and F3 (forecast), 9 October 2026. Supersedes the S0 suitability finder (see MODEL_EVOLUTION_LOG.md) |
| Code | `src/kinderprint/analytics/family_fit.py`, `scripts/build_family_fit.py`, `scripts/model_school_entry_forecast.py` |
| Outputs | `data/processed/family_fit_community.csv`, `data/processed/school_entry_forecast_community.csv`, `outputs/iteration_3/family_fit.json`, `outputs/iteration_3/family_fit_shapes.json` |
| Reports | `reports/family_fit/family_fit_validation.json`, `reports/family_fit/school_entry_forecast.json`, `reports/family_fit/change_log.json` |
| Served by | `GET /api/family-fit/setup`, `/search`, `/areas/{id}`, `/shapes` (backend `loaders/family_fit.py`). Page: `/where-to-live` |
| Tests | `datascience/tests/test_family_fit.py` (22), `backend/tests/test_family_fit.py` (27) |
| Decision record | `decisions/ADR-009-family-fit-and-forecast.md` |

## Intended use

Parents of children aged 0–14 who are choosing where to live in Greater
Melbourne. They choose a suburb to stay near, a maximum straight-line distance
(5, 10, 15 or 25 km) and up to eight child-focused priorities, each marked
*Not a priority*, *Prefer* or *Essential*. The page returns a shortlist of
reporting areas, with reasons, one limitation, a shortlist-stability label and
an outlook for the 2027 AEDC.

**Not for:**

* rating a home, street, school, childcare service or GP practice
* confirming vacancies, enrolment or appointments
* predicting anything about an individual child
* rent or house prices, which are out of scope for this product

## Unit and data

| Item | Detail |
|---|---|
| Unit | 346 AEDC reporting areas (one or more ASGS 2021 SA2s), Greater Melbourne |
| Coverage | 330 of 346 areas scored on every need; each need scored for at least 95% of areas (gate: 90%) |
| Needs (8 × 2 measures) | Early development (AEDC all five on track; language); social and emotional (social; emotional); physical and outdoor (AEDC physical; public open space); shade and cooler streets (urban heat °C; tree cover); fewer pollution sources (main-road traffic; NPI industrial sites); GP access (E2SFCA 5 km; nearest GP km); childcare and kinder (E2SFCA approved places; kindergartens per 1,000 under 5); school and transport (primary campuses per 1,000 aged 5–9; public transport stops per 10,000) |
| Sources | AEDC 2009–2024; Cooling and Greening Melbourne 2018; VPA open space; DTP AADT 2019; PTV stops 2026; NPI 2024–25; Victorian school locations 2025; ACECQA 2026; National Health Services Directory 2025; VIF 2023 child population; SEIFA 2021 (audit only) |

## Method

1. **Small-numbers adjustment.** Each AEDC share is shrunk with an
   empirical-Bayes beta-binomial prior fitted per SA4. Areas with few children
   move toward their region; large areas barely move.
2. **Comparable scales.** Every measure becomes a direction-aligned Greater
   Melbourne percentile (average ranks for ties). A need score is the mean of its
   two measure percentiles, rounded to 4 decimals so the engine and the API make
   identical Essential decisions.
3. **Services across borders.** GP and childcare access use the enhanced
   two-step floating catchment (Gaussian decay, 5 km) aggregated from SA2 to
   reporting area, so a service just over a border still counts.
4. **Match score.** The weighted mean of the chosen need scores (Prefer = 1,
   Essential = 2). An area must have a need score at or above 50 (the Melbourne
   median) on every Essential priority. Areas missing data for a chosen priority
   are excluded and counted, never imputed.
5. **Shortlist stability.** The whole search is re-run 200 times (backend, seeded
   deterministically) with AEDC shares drawn from their posterior: distance,
   data availability, every Essential threshold and the ranking are applied again
   on each draw, so areas can enter or leave the shortlist. The share is the
   chance of being in the top 10 under the search the user ran. Each area's
   measures are drawn independently (an assumption; related AEDC measures are
   correlated in reality). Monte Carlo standard error is at most 3.5 points.
   Corrected 12 October 2026: earlier versions re-ranked only the initially
   eligible areas, which overstated stability (one review search showed 100%
   where the full search kept the area in 62.5% of draws). Labels:
   *stable* if the area stays in the top 10 in at least 90% of runs; *fairly
   stable* at 60–89%; otherwise *could change*. Only shown when a school-entry
   priority is chosen, because no other measure is sampled.

The match score is a comparative index from 0 to 100. It is not a probability.

## Validation (all figures from the published reports)

| Check | Result |
|---|---|
| Scale balance: the S0 finder, "shade + healthcare" search | GP and pharmacy drove 94.2% of score variance; heat and canopy 5.8% |
| Scale balance: S2, same search | Each measure 22.6–29.3% (gate: 15–35%) |
| Border credit | 16 of 20 areas with no GP inside their border have GP access nearby (median nearest GP 2.08 km) |
| Small-numbers adjustment, backtest 2021 → 2024 | Error 7.9–9.9% lower across the five AEDC measures; 15.3–22.3% lower for the 32 smallest areas |
| Sensitivity (top-10 Jaccard; Essential at the 40th/60th percentile; Essential weight 1.5/3) | 0.67–1.0 across three reference searches |
| Reference searches | Box Hill toddler, Footscray school starter, Dandenong pre-teen; the API reproduces each ranking exactly (backend parity test) |
| Blocking gates (9) | All pass. A failed gate exits 1 and publishes nothing (tested) |

### Fairness audit (disclosed, not hidden)

IRSD is never scored. It is audited after scoring:

* For two-need searches, the median Spearman correlation between match score
  and IRSD is 0.50 (range −0.03 to 0.75).
* By need: early development 0.74; social and emotional 0.59; shade 0.58;
  GP access −0.12; pollution 0.13.

So searches that weight school-entry outcomes favour less-disadvantaged areas.
This reflects the AEDC outcomes themselves, not a modelling choice. The page
says that results are area-level and never describe a child, and the details
panel shows the measures behind every score.

## 2027 school-entry outlook (forecast F3)

**Question.** The share of children on track in all five AEDC domains in each
reporting area at the next census (2027).

**Design.** Rolling origin. Train on 2012→15, 2015→18 and 2018→21; hold out
2021→24 (342 areas); then refit on all four transitions to forecast 2027.
Selection rule, fixed in advance: lowest child-weighted MAE on the holdout. A
more complex model must beat the simpler one by at least 3%. Because 2021→24 is
used to make that choice, the table below is a validation result, not an
untouched test. The untouched test is in "Validation design and limits".

| Model | Weighted MAE (pp) | Spearman | 80% coverage | Within ±10 pp |
|---|---|---|---|---|
| F0 persistence | 7.56 | 0.51 | 0.73 | 67.8% |
| F1 shrunk persistence | 7.01 | 0.56 | 0.73 | 72.2% |
| F2 F1 + Melbourne trend | 6.90 | 0.56 | 0.73 | 72.8% |
| **F3 ridge, relative to Melbourne (selected)** | **6.43** | **0.65** | **0.70** | **75.7%** |
| F4 gradient boosting | 6.88 | 0.61 | 0.58 | 73.1% |

* F3 is 14.9% more accurate than persistence. Top-quarter precision is 0.57
  (F0: 0.48).
* F3 predicts an area's position relative to Melbourne (features: the shrunk
  relative share in this cycle and the last, the SA4 relative share and change,
  log children assessed, and IRSD). Melbourne's level is carried forward. This
  fixes an earlier version that reverted toward the historical mean.
* Greater Melbourne fell 3.5 percentage points between 2021 and 2024. No model
  trained on earlier cycles anticipated that, so every candidate carries a
  common bias of +3.0 to +4.1 pp on the holdout (over-prediction). After removing the common shift,
  F3's error is 5.68 pp.
* For that reason the holdout 80% coverage is 0.70, below nominal. Published
  intervals add a cycle-shock variance estimated from all four transitions
  (1.80 pp, against 0.57 pp in the holdout fit), so the 2027 ranges are wider.
* Holdout outcomes are never used in fitting or alpha selection (tested), but
  they are used to choose the candidate.
* The 2027 range is labelled a "nominal 80% range (coverage not yet
  demonstrated)" in the report and in the CSV (`interval_label`).

### Validation design and limits

Source: `chronological_evaluation` in `reports/family_fit/school_entry_forecast.json`.

* **Selection and test are separate.** The candidate is chosen by training on
  2012→15 and 2015→18 and validating on 2018→21 (337 areas). Ridge alpha is
  tuned by grouped CV inside training. The selection code refuses any panel
  that contains years after 2021 (tested). The chosen candidate is refitted on
  the three earlier transitions and scored once on 2021→24 (342 areas).
* **Result.** Validation chose F3 (MAE 5.27 pp; F4 5.46, F1 6.22, F0 6.73), the
  same model as the published rule. On the untouched test F3 has weighted MAE
  6.43 pp against 7.56 pp for persistence (skill 14.9%) and Spearman 0.65
  against 0.51.
* **Bias.** F3 over-predicts by +3.48 pp on the test (persistence +3.25 pp),
  because Greater Melbourne fell 3.5 pp. The error after removing the common
  shift (5.68 pp) is a diagnostic only. It assumes the shift was known in
  advance and is not operational performance.
* **Coverage, past-only residuals.** Interval SD comes only from out-of-time
  residuals available at the 2021 origin (2015→18 predicted from 2012→15;
  2018→21 predicted from 2012→15 and 2015→18). No cycle-shock term is added.

  | Model (test 2021→24) | Observed 80% (nominal 80%) | Mean width 80% | Observed 95% (nominal 95%) | Mean width 95% |
  |---|---|---|---|---|
  | F0 persistence | 73.1% | 23.1 pp | 90.1% | 35.3 pp |
  | F3 ridge (selected) | 69.9% | 17.9 pp | 88.9% | 27.4 pp |

  Both are below nominal. On the 2018→21 validation transition F3 covered
  79.2% and 92.9%.
* **2027 intervals are not validated.** They add a cycle-shock SD (1.80 pp)
  estimated after 2024 was seen. Their coverage has not been tested.
* **IRSD 2021 is reused for every origin.** The 2012, 2015 and 2018 transitions
  therefore use information that was not available at their origin.
* **Weak test.** One test transition; its 342 areas share one Melbourne-wide
  shift, so their errors are not independent. The outlook is exploratory: it
  ranks areas better than persistence on one cycle, but its level and interval
  are not shown to be calibrated.

## Limitations

* AEDC has four transitions of history, and 2024 followed pandemic-affected cohorts.
* The 2027 outlook is exploratory; its 80% range is nominal (see "Validation design and limits").
* Environment measures date from 2018 and 2019. Services come from 2025–26 snapshots.
* Distances are straight-line from area centroids, not travel time.
* Childcare figures are approved capacity, not vacancies.
* Each area is one average; streets within it can differ.

## Monitoring and refresh

* `scripts/refresh_iteration3.py` runs acquire → build → test gate → pipeline
  KPIs (K1–K7). If any stage fails, including a missed KPI target, every file the
  run could write is put back exactly as it was (tested by fault injection at each
  stage and recorded in `reports/iteration3/refresh_rejected_run.json`).
* `.github/workflows/data-refresh.yml` runs it on a schedule. It uploads the
  validation and change-log reports and writes the change-log summary to the
  run.
* `change_log.json` records changed input hashes, added or removed areas, and
  need scores that moved by more than 10 points.
