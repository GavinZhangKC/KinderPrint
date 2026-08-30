# KinderPrint — MDS Data Science Execution Plan

**Author:** (you) · **Unit:** FIT5120 Industry Experience Studio Project, S2 2026
**Status:** v1.0, written before any dataset was downloaded
**Companion files:** `config/data_source_register.csv`, `config/data_compatibility_matrix.csv`, `config/ds_backlog.csv`

---

## 0. Assumptions you must correct before using this plan

| # | Assumption | Correct it if |
|---|---|---|
| A1 | Semester 2 2026 teaching began late July; today (28 Aug 2026) is around week 5 | Your actual week differs — shift every date, the sequence holds |
| A2 | Iteration milestones fall near weeks 6, 9 and 12 | Your unit uses different checkpoints |
| A3 | You are the sole MDS student on the team | You share the DS role — then split at the workstream boundary, not the task boundary |
| A4 | Iteration 1 scope is **Victoria** (or Greater Melbourne) SA2, national-ready | Your team committed to national scope — then raise the compute and time cost now |
| A5 | A user study with 5–8 participants is permissible as usability testing without formal ethics review | Confirm with your unit coordinator this week; it is on the critical path |

---

## A. Rubric-to-work mapping

The rubric is 80 points across five criteria. **60 of those 80 sit in three criteria**, and only one of the three is about modelling. Allocate effort accordingly.

| Rubric criterion | Points | What HD ("Beyond Expectations") actually asks for | Workstreams | Evidence artefacts |
|---|---|---|---|---|
| **Acquisition and Manipulation** | 20 | *Large number of diverse relevant sources; integration with minimal bias; **superior** understanding of data quality and limitations* | DS-02 → DS-07, DS-17 | 01, 02, 03, 04, 05, 06, 07, 08, 21 |
| **User Understanding and Behaviour Change** | 20 | *Superior understanding of user behaviour and how data can influence it* | DS-01, DS-10, DS-14, DS-18 | 13, 22, 29 |
| **Requirement Refinement and Model Evolution** | 20 | *Validates sources through appropriate methods; **trains and evolves models over time**, incorporating new data and feedback* | DS-09, DS-11, DS-12, DS-15, DS-16, DS-19 | 11, 12, 14, 15, 16, 19, 20, 25 |
| **Impact and Future Opportunities** | 10 | *Superior evaluation of future opportunities* | DS-21, DS-22 | 26, 28 |
| **Presentation** | 10 | *Exceptionally clear, well-organised, professional* | DS-14, DS-23 | 29 + all reports |

**Three observations that should shape your effort:**

1. The word "superior" appears twice in the HD column: on **data quality/limitations understanding** and on **user behaviour**. Those are the two dimensions where the HD band is distinguished from the D band. Depth there beats breadth elsewhere.
2. "Trains and evolves models over time, incorporating new data and feedback" appears identically in the HD and D bands. The differentiator for HD is the *superior data analysis* clause above it. A genuine V0→V1→V2 chain with documented triggers is required for D; **rigour of the analysis driving those changes** is what lifts it.
3. User Understanding is worth as much as all modelling. It is also the dimension that needs calendar time (recruit → run → analyse → feed back). Start it in week 6, not week 11.

---

## B. Week-by-week execution plan

Assumes ~8 working weeks remain. Adjust per A1/A2.

| Week | Focus | Must complete | Gate |
|---|---|---|---|
| **W5 (now)** | Acquisition + the four unknowns | DS-02.1, DS-02.2, DS-02.3, download AEDC + ASGS, DS-03.1 | **Are AEDC child counts published? Which ASGS edition?** Everything downstream depends on this |
| **W6** | Foundation complete | DS-03.2, DS-03.3, DS-04.1, DS-04.2, DS-05.1, DS-05.2, DS-06.1. Recruit user-study participants. Iteration 1 demo | Analysable Victorian SA2 count established |
| **W7** | Features + EDA | DS-07.1, DS-08.1, DS-08.2, DS-08.3, DS-09.1. Priority V0 running | Moran's I result decides the validation strategy |
| **W8** | Model V1 + matching baseline | DS-09.2 (V0→V1 residual model), DS-11.1, DS-11.2, DS-10.1 | V0-vs-IRSD correlation documented as the V1 trigger |
| **W9** | Environment layer + Iteration 2 | DS-05.3, DS-07.2, DS-07.3, DS-11.3, DS-13.1. Iteration 2 demo | Zonal statistics validated on a synthetic case |
| **W10** | **User study week** | DS-18.1 run and analysed, DS-12.1, DS-12.2, DS-13.2 | Study data collected — this week cannot slip |
| **W11** | Evolution from feedback + robustness | DS-18.2 (V2 triggered by user evidence), DS-16.1, DS-17.1, DS-17.2, DS-15.1 | V2 traceable to a named participant finding |
| **W12** | Automation, handover, presentation | DS-20.1, DS-20.2, DS-21.1, DS-22.1, DS-22.2, DS-23.1, DS-14.1. Iteration 3 | Full pipeline rerun demonstrated live |

**Environment data is deliberately late (W9).** DS-05.3, DS-07.2 and DS-07.3 are the highest-effort, lowest-certainty tasks. Priority + matching + explainability on AEDC/SEIFA/Census alone is already a complete, demonstrable product. If raster work overruns, you ship without it and document the reason — which is a defensible engineering decision. If you sequence environment first and it overruns, you have nothing.

---

## C. LeanKit backlog

See `config/ds_backlog.csv` — 47 items, each with id, task, reason, input, output, dependency, method, validation, KPI, rubric criterion, evidence artefact and definition of done. Import directly.

Suggested board columns: `Backlog → Blocked-on-data → In analysis → In validation → Evidence written → Done`. The two columns most teams omit — *In validation* and *Evidence written* — are the ones that map to the rubric, so make them visible.

---

## D. Dataset acquisition order

| # | Dataset | Why here | Blocks |
|---|---|---|---|
| 1 | **AEDC SA2 2009–2024** | Carries all four unresolved design-breaking unknowns | Everything |
| 2 | **ASGS Edition 3 SA2 boundaries** | Join target; needed to validate AEDC's codes | DS-05, all spatial work |
| 3 | **SEIFA 2021 SA2** | Small, clean, the matching backbone and the residual model's predictor set | DS-09, DS-11 |
| 4 | **Census 2021 GCP SA2** | Remaining matching covariates; large and fiddly | DS-11 |
| 5 | **ASGS Mesh Block + populations** | Weighting layer for zonal statistics | DS-05.3 |
| 6 | **SILO gridded max_temp** | First raster work; builds the zonal machinery | DS-07.2 |
| 7 | **DEA Land Cover v2.0.0** | Heaviest; reuses machinery from (6) | DS-07.3 |

Items 1–4 give a complete working product with no geospatial processing at all.

---

## E / F. Register and matrix

`config/data_source_register.csv` and `config/data_compatibility_matrix.csv`, both in your specified field schema, pre-filled with everything verifiable from publisher documentation and with unverified fields explicitly marked. The matrix classifies every pair GREEN/AMBER/RED and names the validation test for each AMBER.

---

## G. EDA hypotheses

Each hypothesis has a pre-stated test and — critically — a stated consequence, so the EDA drives decisions rather than decorating the report.

| ID | Hypothesis | Test | If TRUE | If FALSE |
|---|---|---|---|---|
| H1 | AEDC vulnerability is spatially clustered | Global + Local Moran's I, queen contiguity, permutation inference | Spatial block CV required; random CV would leak | Standard CV acceptable; document why |
| H2 | SEIFA and AEDC vulnerability are strongly associated | Spearman + scatter with LOESS | Confirms the residual-based priority design (V1) | The residual design loses its rationale — revert to overlap method and document |
| H3 | Vegetation varies systematically with disadvantage | Correlation across IRSD deciles | Vegetation is partly a disadvantage proxy — must be interpreted as such in matched comparisons | Vegetation carries independent information |
| H4 | Heat and vegetation are redundant | Correlation + VIF | Use one, or a composite, and say why | Retain both as distinct signals |
| H5 | Environmental variables are strongly geographically patterned | Moran's I on each environmental feature | Matching **must** be stratified geographically or the signature is confounded | Stratification less critical (unlikely — expect TRUE) |
| H6 | Areas missing from AEDC or environment data are systematic | Logistic model of missingness on remoteness, population, IRSD | Representation bias — must appear in BIAS_AND_LIMITATIONS and in the UI | Missingness is at random; still document |
| H7 | Socioeconomically similar communities show meaningful AEDC differences | Within-stratum variance of AEDC at fixed IRSD decile, with critical-difference testing | **The product's core premise holds** | The premise fails — the honest response is to report that and pivot the framing. Report it either way |

H7 is the project's falsification test. Run it early (W7). If similar communities do not differ beyond noise, you have a genuine, publishable negative finding — and reporting it honestly will score better than a product built on a premise you never tested.

---

## H. Data quality framework

| Dimension | Metric | Test | Threshold |
|---|---|---|---|
| Completeness | missingness % per indicator per SA2 | assert missingness ≤ stated max | set per indicator, in advance |
| Validity | valid-value % | percentages in [0,100]; temperature plausible; IRSD within published range | 100% |
| Consistency | unit and definition match across sources | schema contract per stage | 100% |
| Uniqueness | duplicate rate on (SA2, year, indicator) | assert primary key unique | 0 duplicates |
| Timeliness | lag in years vs AEDC reference | recorded per source pair | disclosed, not thresholded |
| Geographic compatibility | join coverage % and unmatched code count | set difference both directions | 100% match or documented exception |
| Temporal compatibility | documented lag + sensitivity result | AEDC 2021 replication | rank correlation reported |
| Provenance | % of fields traceable to the register | register completeness check | 100% |

**On the unit's example KPI of ">95% data accuracy":** accuracy is not measurable here — there is no ground truth against which an SA2's vegetation share is right or wrong. Substituting measurable metrics (schema compliance %, join coverage %, valid-value %, test pass rate) and *explaining why accuracy does not apply* is itself evidence of the judgement the HD band asks for. Write that explanation down in `docs/DS20_pipeline_kpis.md`; do not just quietly use different numbers.

---

## I. Geographic harmonisation decision process

1. Record each dataset's native geography and ASGS edition (register).
2. Build the support matrix: which analytical level does each dataset actually publish?
3. Identify boundary changes between candidate editions.
4. Locate official ABS correspondences where a change exists.
5. Estimate information loss at each candidate level (variance retained, n areas, minimum child count per area).
6. Select, with the rejections documented as an ADR.
7. For every derived spatial feature record: CRS, source resolution, aggregation method, weighting, missing coverage, validation.

**Pre-verified constraint (from publisher documentation, 28 Aug 2026):** AEDC's finest ASGS output is SA2 — no SA1. SEIFA publishes SA1 and SA2 with SA2 as a population-weighted average of SA1s. Census publishes SA2. SILO is a ~5 km grid; DEA is 30 m. So SA2 is the finest level jointly supported, and **the live decision is the edition, not the level**: ASGS Edition 4 (2026) is now ABS's "latest release", SA2 boundaries have changed, and Edition 4 codes will partially match Edition 3 codes without erroring. Pin Edition 3.

Rejections to document: SA1 (no AEDC), SA3 (averages away within-city variation — the project's whole point), LGA (non-ABS structure, reissued annually, not cleanly nested), AEDC Community (not shared by ABS sources).

---

## J. Feature-selection framework

Every feature enters `config/features.yaml` with your 15 specified fields. Three hard rules enforced by tests:

1. **Leakage rule.** `used_for_matching` and `used_for_environment_comparison` are mutually exclusive. Automated test asserts no feature carries both. This is the rule that protects the product's central claim.
2. **Confounder vs mediator.** Excluding environmental variables from matching is necessary but insufficient. Also exclude anything *downstream* of the environment (matching on a mediator blocks the very signal you are hunting). Dwelling density is the ambiguous case — it is plausibly a confounder for vegetation and plausibly a mediator. Decide, document the reasoning, and run it both ways in DS-16.1.
3. **Double-counting rule.** IRSD is constructed from Census income, education and employment. Do not put IRSD *and* those raw Census variables into the same composite or the same distance metric. Pick one; justify.

---

## K. Priority model experiment plan

| Version | Method | Trigger for the next version | Evidence produced |
|---|---|---|---|
| **V0** | Percentile-threshold overlap across indicators | Expected: V0 correlates near-perfectly with IRSD, i.e. it reproduces a disadvantage map — precisely what the project says it must not be | The correlation coefficient IS the documented trigger |
| **V1** | Model AEDC vulnerability on socioeconomic + demographic features; rank SA2s by **residual** (worse than its socioeconomic position predicts) | Sensitivity or user feedback | Residual model + spatial CV + SHAP contributions |
| **V2** | Change driven by DS-16.1 sensitivity or DS-18.1 user findings | — | Comparison table V0/V1/V2 |

Assess all six candidate methods (A–F) against interpretability, sensitivity, missing-data behaviour, bias risk and user usefulness before selecting. **Document the rejected four.** Rejection with evidence is scored as judgement; deploying the most complex option is not.

Labels: `LOWER / MODERATE / HIGHER` investigation priority. No decimals. No "risk".

---

## L. Community matching experiment plan

| Version | Method | Expected diagnosis | Evidence |
|---|---|---|---|
| M0 | Unscaled Euclidean KNN, k=1 | Dominated by large-scale features (population) | SMD table showing imbalance |
| M1 | Standardised Euclidean | Better, but correlated covariates double-counted | SMD + correlation matrix |
| M2 | Mahalanobis | Handles correlation; may still pair geographically absurd areas | SMD improved, but geographic inspection fails |
| M3 | **Exact-match on GCCSA + remoteness class, then Mahalanobis with a distance caliper** | Comparable *and* geographically plausible | Final SMD, match coverage, refusal rate |

M0→M3 is a real evolution narrative, not a manufactured one: each step is triggered by a diagnostic that the previous step fails. Keep every version runnable.

**Evaluation metrics** (not accuracy — this is not supervised classification): standardised mean difference per covariate, covariate balance plot, nearest-neighbour distance distribution, match coverage %, match stability under feature-set and scaler perturbation, and geographic plausibility review with your mentor.

**`NO SUITABLE MATCH` is a first-class result.** Set the caliper from the distance distribution *in advance*, report the percentage of SA2s with no acceptable match, and render the refusal in the UI.

---

## M. Advanced modelling experiment plan

The unit spec requires machine learning. Your project's scientific boundary forbids causal claims. These are reconcilable, but only one way:

**The ML must produce a product feature, not a decoration.** The residual model in V1 does exactly this — a supervised model whose *purpose* is its residuals, which become the priority signal, and whose SHAP values become the Level 3 drill-down. That is ML that the user sees and uses.

| Candidate | Verdict | Reasoning |
|---|---|---|
| Regularised regression / GAM for the residual model | **Likely adopt** | n in the low hundreds; interpretable; residuals are the deliverable |
| Gradient boosting for the same | **Evaluate, expect to reject** | Will overfit at this n; compare against the regularised model with spatial CV and report |
| SHAP on the adopted model | **Adopt** | Directly serves the explainability drill-down |
| K-means / hierarchical clustering for peer groups | **Evaluate** | Alternative to KNN matching; compare silhouette and stability |
| Isolation Forest / LOF for outcome outliers | **Evaluate, expect to reject** | Unstable at n in the hundreds with ~10 features; regression residual with prediction intervals is more defensible |
| Spatial lag / spatial error models | **Evaluate if Moran's I is significant** | Non-independence is real; ignoring it is a validity threat |
| Bayesian hierarchical model | **Reject for this iteration, document** | Would handle small-area uncertainty well, but implementation and validation cost exceeds the remaining time. Move to the future opportunity matrix |

**Validation strategy matters more than model choice.** If H1 confirms spatial clustering, use **spatial block cross-validation** — random k-fold leaks information between adjacent SA2s and inflates performance. Stating and acting on this is exactly the "superior data analysis" the HD band describes.

Formally rejecting two models with evidence is stronger rubric material than deploying five.

---

## N. Model evolution strategy

Two feedback injection points are scheduled deliberately so evolution happens naturally rather than being retrofitted:

1. **W8 — diagnostic feedback.** V0's correlation with IRSD triggers V1. M0–M2's balance diagnostics trigger M3.
2. **W10–11 — user feedback.** The user study triggers V2 and at least one explainability change.

`docs/MODEL_EVOLUTION_LOG.md` gets an entry **in the same commit as the model change**. Markers can read git history; entries dated after the fact are visible.

---

## O. Robustness and sensitivity strategy

Eight axes: weight, threshold, scaler, feature set, geographic level, time period, missing-data handling, matching method.

Two metrics throughout: **Spearman rank correlation** between runs, and **top-k Jaccard overlap** (k = 10, 20).

The question to answer explicitly: *if the weighting moves ±10%, do completely different communities become priorities?* If yes, the priority output is not decision-grade and must carry a stability flag in the product. Surfacing instability is better evidence than hiding it.

---

## P. Bias, equity and representation

Investigate and map: whether AEDC suppression concentrates in rural/remote or small-population SA2s; whether small child counts produce unstable estimates that then drive priority ranking; whether IRSD dominates every output; whether conclusions change at SA3; whether the ~5 km heat grid gives metropolitan SA2s systematically less real information than rural ones.

Output: `docs/BIAS_AND_LIMITATIONS.md` plus a coverage map. Every systematic exclusion named, quantified and mapped.

---

## Q. User-behaviour evaluation protocol

Within-subject design, 5–8 participants (studio mentor, students from other teams, and if at all possible 1–2 actual practitioners — even one changes the credibility of this section).

**Control condition:** the real status quo — the AEDC SA2 spreadsheet, the SEIFA spreadsheet, and a generic map. Not a strawman; this is genuinely how the work is done today.

**Task (both conditions):** "Identify one community you would investigate first, and explain why."

**Pre-registered measures:** time to decision; confidence (1–5); explanation completeness (scored against a rubric written *before* running); number of distinct indicators cited; whether an environmental factor was identified; trust (1–5); limitation awareness (did they spontaneously note that this is not causal?).

**Behaviour change is the point.** The claim you want to be able to evidence is not "users liked it" but "users changed which community they chose, or changed the reasons they gave". Record the actual choices in both conditions.

Confirm the ethics position with your unit coordinator **this week** — it is on the critical path. Never fabricate a participant, a number, or a quote.

---

## R. Automation plan

`python -m scripts.refresh_data` runs: extract → validate raw → clean → harmonise → feature engineer → validate processed → save → analytics → export. Config-driven, logged, no silent failures, emits a data-quality report per run and captures data version + pipeline version + schema version.

Demonstrate a full rerun from raw during the final demo. That single demonstration is the cleanest evidence for the automation KPI.

---

## S. Monitoring plan

Track and baseline: data version, model version, pipeline status, schema drift, missingness drift, match quality distribution, priority distribution. A simple HTML report per run is sufficient — the requirement is that the next team can detect a schema change without reading your code.

---

## T. Visualisation plan

Eleven production visuals, each with a register entry recording: user question answered, data shown, visual encoding, interaction, misinterpretation risk, accessibility. Colour-blind-safe palettes; never colour alone.

Priority choropleth · community profile · percentile bars · AEDC domain chart · missing-data map · matching balance plot · matched-pair comparison · environmental difference signature · priority contribution (SHAP) chart · sensitivity/rank-stability plot · model comparison chart.

The misinterpretation-risk field matters most on the choropleth: a red-shaded map of "priority" communities is one design decision away from being read as a bad-suburb ranking. Document how the encoding prevents that.

---

## U. Documentation plan

29 evidence artefacts, mapped in section X. Write them as you go — each is the definition-of-done for a backlog item, not a final-week task.

---

## V. Reflective diary plan

One entry per week, fixed 10-heading template, **each citing a specific analytical decision with a specific number**. Compare: "I learned about data quality" (bottom band) versus "AEDC's SA2 file publishes percentages without child counts, so I could not compute confidence intervals; I escalated this in W5 and changed the comparison requirement to report the AEDC critical difference instead" (top band).

Backfilled diaries are detectable and are explicitly penalised in the rubric's bottom band ("reflective diary entry is not submitted or overdue").

---

## W. GitHub evidence strategy

- Conventional commits scoped to workstreams: `feat(ds-09): add residual-based priority model V1`
- One PR per workstream with the validation result in the description
- CI running `pytest`: schema tests, range tests, leakage test, self-match exclusion, suppression-preservation test
- `docs/decisions/` ADRs for: geography level, ASGS edition, heat threshold, vegetation class mapping, matching method, model rejections
- Tag each model version (`priority-v0`, `priority-v1`, `matching-m3`) so the evolution log points at real commits

The commit history is corroborating evidence for the model evolution claim. Make it tell the story.

---

## X. HD evidence checklist

| # | Artefact | Rubric | Backlog | Done |
|---|---|---|---|---|
| 01 | Data Source Register | R1 | DS-02.1 | ☐ |
| 02 | Data Compatibility Matrix | R1 | DS-02.2 | ☐ |
| 03 | Data Dictionary | R1 | DS-04.1 | ☐ |
| 04 | Raw Data Profiles | R1 | DS-03.1/2 | ☐ |
| 05 | Data Quality Report | R1 | DS-03.x | ☐ |
| 06 | Cleaning Report | R1 | DS-04.1/2 | ☐ |
| 07 | Geographic Harmonisation Report | R1 | DS-05.x | ☐ |
| 08 | Temporal Compatibility Report | R1 | DS-06.1 | ☐ |
| 09 | EDA Report | R1 | DS-08.x | ☐ |
| 10 | Feature Engineering Register | R1 | DS-07.x | ☐ |
| 11 | Priority Methodology | R3 | DS-09.1 | ☐ |
| 12 | Priority Sensitivity Report | R3 | DS-09.3 | ☐ |
| 13 | Explainability Design | R2 | DS-10.x | ☐ |
| 14 | Matching Methodology | R3 | DS-11.x | ☐ |
| 15 | Match Quality Report | R3 | DS-11.2/3 | ☐ |
| 16 | Outcome Difference Analysis | R3 | DS-12.x | ☐ |
| 17 | Environmental Difference Analysis | R1,R3 | DS-13.x | ☐ |
| 18 | Spatial Analysis | R1,R3 | DS-08.3 | ☐ |
| 19 | Model Comparison Report | R3 | DS-15.1 | ☐ |
| 20 | Model Evolution Log | R3 | DS-19.1 | ☐ |
| 21 | Bias & Equity Analysis | R1,R4 | DS-17.x | ☐ |
| 22 | User Evaluation | R2 | DS-18.1 | ☐ |
| 23 | Automated Pipeline | R1,R4 | DS-20.1 | ☐ |
| 24 | Pipeline Quality Report | R1 | DS-20.2 | ☐ |
| 25 | Model Card | R3,R4 | DS-23.1 | ☐ |
| 26 | Future Opportunity Matrix | R4 | DS-22.2 | ☐ |
| 27 | Reflective Diary | all | DS-24.1 | ☐ |
| 28 | Handover Documentation | R4 | DS-21.1 | ☐ |
| 29 | Presentation Visuals | R5 | DS-14.1 | ☐ |

---

## Critical path

```
DS-03.1 (AEDC profile — the four unknowns)
   → DS-05.1/5.2 (geography locked)
      → DS-07.1 (feature register)
         → DS-09.2 (priority V0→V1)
            → DS-10.1 (explainability)
               → DS-18.1 (user study)      ← longest lead time
                  → DS-18.2 (V2 from feedback)
                     → DS-19.1 (evolution log complete)
```

Two items sit on this path with external dependencies you do not control: **the AEDC file's contents** (W5) and **user-study participants** (recruit W6, run W10). Both must be started earlier than feels necessary.

## High-risk technical assumptions

| Risk | Impact if wrong | Detect by | Mitigation |
|---|---|---|---|
| AEDC SA2 file publishes child counts | No CIs, no critical difference, matched-pair comparison unsafe to display | DS-03.1, W5 | Fall back to reporting differences without significance and stating the limitation prominently; or request counts from AEDC Data Management Agency |
| AEDC codes are ASGS Ed 3 | Every join silently wrong | DS-03.1, W5 | Obtain the ABS correspondence and apportion, documented |
| AEDC SA2 assignment is residence-based | Environmental joins lose their meaning | AEDC Data Dictionary, W5 | If school-based, reframe environmental indicators as school-catchment exposure and say so |
| Victorian SA2 n is large enough for the residual model | Model overfits; conclusions unstable | DS-03.2, W6 | Drop to regularised regression or GAM; widen to national |
| Suppression is not concentrated in rural SA2s | Systematic representation bias | DS-03.3, W6 | Report as a bias finding; restrict scope to metropolitan with justification |
| A ~5 km heat grid can distinguish urban SA2s | **It cannot.** Any within-city heat difference you report is largely interpolation artefact | Known now | Flag every environmental difference against the indicator's effective resolution (DS-13.2); confine strong heat claims to regional contrasts |

## Methodological risks

1. **The product reproduces a disadvantage map.** Highest-probability failure. Mitigated by the V0→V1 residual design and by DS-17.2 measuring IRSD's share of explained variance.
2. **Matching rediscovers climate zone.** Mitigated by stratified matching (M3).
3. **Environmental indicators measure the wrong thing.** Area-share vegetation measures farmland; area-mean temperature is not exposure. Mitigated by population weighting and populated-area masking.
4. **Differences reported that are smaller than the noise.** Mitigated by DS-12.2 (critical difference) and DS-13.2 (resolution flag).
5. **Spatial non-independence inflates model performance.** Mitigated by spatial block CV, conditional on H1.
6. **ML bolted on to satisfy the rubric.** Mitigated by requiring every model's output to be a user-visible product feature, and by documenting rejections.

## Parallel vs blocked

**Can run in parallel from now:** DS-01.1, DS-01.2, DS-02.1, DS-02.2, DS-02.3, DS-24.1 — all documentation and user-facing work needing no data. Participant recruitment. Repo, CI and test harness setup.

**Blocked until the AEDC file is inspected:** everything in DS-04 onward. Do not write cleaning code against a schema you have not seen.

**Blocked until geography is locked (DS-05.2):** all spatial work, all matching, all priority.

**Blocked until a working prototype exists:** DS-18.1.

---

## The first dataset to download

**`sa2-2009-24.xlsx` from the AEDC Additional Data page** — https://www.aedc.gov.au/data-hub/public-data/additional-data (~5.9 MB).

Not because it is the geographic backbone — it isn't. Because it is the only dataset that can invalidate the design, and it carries four unknowns that each change the project:

1. **No child counts** → no confidence intervals, no critical difference, and your matched-pair comparison feature cannot honestly display a 32%-vs-21% claim. The product's headline feature changes shape.
2. **Wrong ASGS edition** → every join needs a correspondence file and an apportionment method, adding a workstream.
3. **Heavy suppression** → your analysable n shrinks and the bias analysis becomes a headline finding rather than a section.
4. **School-based rather than residence-based assignment** → every environmental join means something different from what you assumed.

None of these are visible in a boundary file, a SEIFA table or a raster. All four are answerable in about two hours of inspection. Download ASGS Edition 3 the same day — it is small and you need it to validate AEDC's codes — but open the AEDC file first.
