# Evidence index: MDS rubric and KPIs

Dated 12 October 2026. Each row points to the implementation, an execution
output, what the user sees, the stated limitation, and my contribution. Paths
are inside `datascience/` unless they start with `backend/`, `frontend/` or
`.github/`; the AWS deployment document is `docs/AWS_VKINDER.md` at the
repository root.

Author of the data-science work: Karthika P Kumar (all models, pipelines and
data documents in `datascience/`; data APIs in `backend/loaders/` and the Child
Health, Where to live and map navigation pages).

## 1. Acquisition and Manipulation (20)

| Claim | Implementation | Execution evidence | User-facing | Limitation stated |
|---|---|---|---|---|
| 31 diverse sources aligned with product goals | `datascience/config/data_source_register.csv` | Checksums and capture dates per source | Every page names its source and year | Several sources are annual or older (SEIFA 2021, environment 2018) |
| Inconsistent grains integrated (mesh block, point, line, SA2, PHA, SA3, Department area) | Bridges in `datascience/data/processed/*bridge*`, `community_sa2.csv`; `docs/ACECQA_SPATIAL_LINKAGE.md` | ACECQA authority-ID linkage 96.23%, 0 duplicates; G-NAF comparison 66% | PHA values shown as regional context, never as SA2 | 189 ACECQA services unresolved and excluded, not guessed |
| Quality and missing data handled without imputation | QA rules `scripts/iteration3_qa.py`; suppression rules in `docs/PHIDU_CHILD_HEALTH.md`, `reports/DS03_aedc_profile.md` | K7: 71,085 of 71,346 displayed cells populated, 261 missing kept, 0 imputed (`reports/iteration3/pipeline_kpis.json`) | "Not reported" and "Not available" states | K7 is completeness, not accuracy |
| Errors found and fixed by QA | `docs/DS20_PIPELINE_RELIABILITY.md` (QA findings) | 112 duplicate national rows removed; negative cost (−$25.23) no longer served; regression test | Compare care cost gaps are never negative | Four live sources verified by fixtures until a live run |
| Automated refresh that cannot publish a bad run | `scripts/refresh_iteration3.py`, `.github/workflows/data-refresh.yml` | `reports/iteration3/refresh_run.json` (published, 365 tests, KPIs met); `refresh_rejected_run.json` (missed KPI, 25 of 25 files unchanged); `tests/test_refresh_rollback.py` | Data shown always comes from a passed run | Scheduled live runs start once the workflow is on the default branch |
| Bias and data limitations analysed | Disadvantage guard (|ρ| ≤ 0.20); `docs/DATA_COMPATIBILITY_MATRIX.md`; PHIDU hypothesis screen | Guard 0.013; 7 BH-corrected tests, 0 supported (`reports/PHIDU_ENVIRONMENT_FINDINGS.md`) | No unsupported health claims on pages | Ecological data; no individual inference |

**KPI 2 (Automated Data Sourcing and Pipeline Integrity):** K1–K7 all met on the
latest run (`reports/iteration3/pipeline_kpis.md`); K5 reproduces 13 of 13 outputs
byte-identically in content; rollback proven by fault injection. The specification's
">95% data accuracy" is an example; for area data without ground truth I report
linkage quality, validity, coverage, key integrity and completeness instead, each
with its denominator.

## 2. User Understanding and Behaviour Change (20)

| Claim | Implementation | Evidence | Limitation |
|---|---|---|---|
| Two audiences with different decisions | Parent and practitioner views across Child Health and Where to live | Page screenshots in the handover; navigation test (103 of 104 checks) | Healthy day check is parent-only by design |
| Data turned into actions, not scores | Today plan, vaccine schedule, Play today hours, care routing, Family Fit reasons and one limitation per card | `backend/loaders/family_fit.py` result cards | Actions are general guidance, not medical advice |
| Wording tested against what the data supports | Feedback-driven changes in `docs/MODEL_EVOLUTION_LOG.md` (Family Fit "Design changes from feedback") | "Ready for school" and "Improving" replaced; capacity not vacancies | |
| Measured user understanding and intended action | User study `reports/DS18_user_evaluation.md` (kit in the handover) | Paired with/without-Vkinder tasks, n and individual results reported; one change and a retest | Small convenience sample; intended action is not long-term behaviour change |

## 3. Requirement Refinement and Model Evolution (20)

| Model | Evolution and trigger | Validation evidence | Honest limits |
|---|---|---|---|
| Priority | V0 rule count (ρ 0.795 with disadvantage, rejected) → V1 residual → V2 ridge, out-of-fold | Spatial CV MAE 4.09 vs 4.32 (V1 replica) and 4.45 (boosting); calibration 0.99; explanations reconcile exactly with displayed expectations (max difference 7×10⁻¹⁵ pp, was 3.22); SA4 block bootstrap: 35 of 42 Higher areas stable | Residual clustering I = 0.09; one cycle |
| Matching | M0 → M3 → M4 (IRSD removed after an audit) | VIF 9.43 → 4.13; IRSD becomes an independent check (peer correlation 0.889) | Area-level similarity only |
| Access | Count inside border → E2SFCA | Conservation test; catchment sensitivity 0.81 / 0.68 | Straight-line distances; edge effect at the fringe |
| Family Fit | S0 averaged mixed scales (94.2% of variance from two measures) → S2 | Each measure 22.6–29.3% of variance; shrinkage 7.9–9.9% lower error; stability reruns the full search (fixed 12 Oct after review) | Independent draws per measure |
| School-entry outlook | F0 persistence → F3 ridge on relative position | Chosen on 2018→2021, tested once on 2021→2024: MAE 6.43 vs 7.56 for persistence, Spearman 0.65 | Exploratory: 80% range covered 69.9% (nominal); bias +3.48 pp; one test transition |
| Plan a change | P0 regression (65.5% of the tree slope was disadvantage) → P2 matched pairs | Coverage 71.1%, balance 90.5%; placebo clear rate 19.7% after calibration | Associations, not effects |
| In 2031 | New: VIF projections with E2SFCA per year | 2026 re-run equals the published access table | Scenario with services held fixed |

Deployment issues and fixes: `datascience/docs/FAMILY_FIT_DEPLOYMENT_LOG.md` (17 issues,
each with a guard). **KPI 1 (ML Deployment and Issue Resolution):** models served
through the API and PostgreSQL on AWS (repository-root `docs/AWS_VKINDER.md`); 365 data-science and
266 backend tests pass.

## 4. Impact and Future Opportunities (10)

`datascience/docs/FUTURE_WORK.md`: ten opportunities rated on value, data,
effort and risk, each with a measurable success test, plus scope decisions.

## 5. Presentation (10)

| Item | Where |
|---|---|
| Current README | `datascience/README.md` |
| Visualisation register | `datascience/docs/VISUALISATION_REGISTER.md` |
| Model cards and ADRs | `datascience/docs/MODEL_CARD_*.md`, `datascience/docs/decisions/` |
| Reflective diary | `datascience/docs/reflective_diary/WK05.md` to `WK11.md` |
| Demo questions | Which area needs practitioner attention and why? Which areas fit a family, and how stable is that shortlist? What does the 2027 outlook add beyond "no change", and when should it not be trusted? |

## Corrections made after the independent review (11–12 October 2026)

| Finding | Fix | Evidence |
|---|---|---|
| A missed KPI still published | Snapshot and restore every tracked file on any failure | `tests/test_refresh_rollback.py`; `refresh_rejected_run.json` |
| Shortlist stability overstated | Full search rerun per draw in API and engine | Counterexample now 62.5%, not 100%; four backend tests |
| Forecast test also chose the model | Chronological selection on 2018→2021, single test on 2021→2024 | `school_entry_forecast.json` → `chronological_evaluation` |
| Explanations from a different fit | Contributions from each area's fold model | `model_expected_vulnerability.json` → `explanation_reconciliation` |
| Range chart clipped values over 30% | Labelled 0–60% scale; immunisation axis no longer cut at 80% | Carlton shows 50.8% beyond its 35.1% upper limit |
| K7 name overstated | Renamed display completeness, with cell counts | `pipeline_kpis.json` |
| Refresh scope narrower than claimed | Practitioner context and In 2031 added to the rebuild; scope documented | `docs/DS20_PIPELINE_RELIABILITY.md` |
| Stale README and compatibility matrix | Rewritten and reconciled | `datascience/README.md`; `docs/DATA_COMPATIBILITY_MATRIX.md` |
