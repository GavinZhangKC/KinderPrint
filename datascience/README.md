# Vkinder data science

Data acquisition, integration, models and quality gates behind Vkinder: child
health and development by area for Greater Melbourne. Geography: ASGS Edition 3
(2021) SA2 and AEDC reporting areas. Every output is area-level; nothing
describes or predicts an individual child.

Status: 12 October 2026 (Iteration 3). For the assessment map, start with
`docs/EVIDENCE_INDEX.md`.

## Run

```bash
pip install -r requirements.txt
python -m pytest tests -q                                  # 365 passed, 28 skipped (lineage files without source_id)
python scripts/refresh_iteration3.py --offline             # rebuild, test gate, KPIs; restores everything on any failure
python scripts/refresh_iteration3.py                       # same with live acquisition of the six Iteration-3 sources
python scripts/pipeline_kpis.py                            # KPIs K1 to K7 only
```

Tests run on a fresh clone: processed tables and reference files are committed.
Raw downloads are not; their URLs, checksums and access notes are in
`config/data_source_register.csv` and `docs/DATA_ACCESS.md`.

## What is here

| Area | Contents | Key documents |
|---|---|---|
| Sources | 31 registered sources across child development, population, socioeconomic, health, services, environment and food | `config/data_source_register.csv`, `docs/DATA_COMPATIBILITY_MATRIX.md`, `docs/LICENCE_COMPLIANCE.md` |
| Integration | SA2, AEDC reporting-area, PHA, SA3 and Department-area bridges; mesh-block, point and line data rolled up to SA2 | `docs/DATA_DICTIONARY.md`, `docs/ACECQA_SPATIAL_LINKAGE.md`, `docs/PHIDU_CHILD_HEALTH.md` |
| Lineage | Every processed file (67) has a producer script and resolvable sources | `config/lineage.csv`, `tests/test_lineage.py` |
| Pipeline | Acquire, QA, build, test gate, KPIs; change logs from content hashes; restore on any failure | `docs/DS20_PIPELINE_RELIABILITY.md`, `.github/workflows/data-refresh.yml` |
| Models | Priority V2, E2SFCA access, Family Fit S2, school-entry outlook, Plan a change, In 2031 | Model cards and ADRs in `docs/` and `docs/decisions/` |
| Evidence | Model evolution, deployment issues, KPIs, visualisations, future work | `docs/MODEL_EVOLUTION_LOG.md`, `docs/FAMILY_FIT_DEPLOYMENT_LOG.md`, `docs/VISUALISATION_REGISTER.md`, `docs/FUTURE_WORK.md` |
| Reflection | Weekly reflective diary | `docs/reflective_diary/` |

## Models at a glance

| Model | Question it answers | Validation | Document |
|---|---|---|---|
| Priority V2 | Which areas have more developmental vulnerability than their case mix predicts? | Leave-one-SA4-out CV: MAE 4.09 pp vs 4.32 for the V1 replica; calibration slope 0.99; disadvantage guard 0.013 | `MODEL_CARD_PRIORITY_V2.md`, ADR-008 |
| Access A1 (E2SFCA) | How reachable are GPs and childcare, allowing for neighbouring areas and shared demand? | Conservation test; catchment sensitivity | `MODEL_EVOLUTION_LOG.md` |
| Family Fit S2 | Which areas near a chosen suburb fit a family's priorities, and how stable is that shortlist? | Shrinkage backtest; weight and threshold sensitivity; API parity | `MODEL_CARD_FAMILY_FIT.md`, ADR-009 |
| School-entry outlook (F3) | Where is the share of children on track likely to be in 2027? | Chronological test on 2021→2024: MAE 6.43 vs 7.56 for persistence. Exploratory; 80% range is nominal | `MODEL_CARD_FAMILY_FIT.md` |
| Plan a change (P2) | How are children doing in similar areas that already have a planned change? | Matched pairs; placebo-calibrated interval | `MODEL_CARD_PLAN_CHANGE.md`, ADR-010 |
| In 2031 | Will childcare and GPs keep up with projected children if nothing new opens? | 2026 re-run reproduces the published access table exactly | `FUTURE_DEMAND.md` |

## Rules that apply everywhere

- Suppressed values stay suppressed; nothing is imputed to improve a score.
- A coarse-geography value (PHA, LGA, SA3) is never copied to an SA2.
- Associations are not presented as causes; area results are not individual predictions.
- Approved childcare places are capacity, not vacancies; a listed GP is not an appointment.
