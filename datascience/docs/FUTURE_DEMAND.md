# Your area in 2031: projected children and service pressure

| | |
|---|---|
| Script | `scripts/build_future_demand.py` |
| Output | `data/processed/future_demand_sa2.csv`: 361 SA2s × 2021, 2026, 2031, 2036 |
| Report | `reports/iteration3/future_demand_validation.json` |
| Served by | `GET /api/future/area`, `GET /api/future/overview`. Page: `/simulation`, view "Your area in the future" |
| Tests | `datascience/tests/test_future_demand.py` (4), `backend/tests/test_future_demand.py` (5) |

## What is predicted, and by whom

Child and total population come from **Victoria in Future 2023**, the
Victorian Government's official SA2 projections by age. Vkinder does not make
its own population forecast.

## What Vkinder derives

All figures hold today's services fixed, so they show pressure "if nothing new
opens".

* **Childcare places per 100 children under 5:** the published E2SFCA access
  measure (5 km Gaussian catchment), re-run with each year's projected
  children.
* **GP practices per 10,000 residents:** the same method, using all ages.
* **Primary school campuses per 1,000 children aged 5–9:** campuses inside the
  SA2.
* **Places to keep 2026 access:** growth in children under 5 multiplied by
  the area's 2026 places per child. This is a rough guide that ignores
  neighbouring areas.

**Gate.** The 2026 re-run must reproduce `access_e2sfca_sa2.csv` exactly. The
maximum difference is 0.0.

## Greater Melbourne results

| | 2026 | 2031 | 2036 |
|---|---|---|---|
| Children under 5 | 321,357 | 348,211 | 374,896 |
| Children 0–14 | 963,292 | 1,012,271 | 1,086,181 |

**2031 in summary**

* Children under 5 increase in 268 of 361 SA2s.
* Childcare access falls in 296 SA2s if no places are added.
* About 19,400 extra places would keep 2026 access.

## Limits

* **Projections are scenarios.** They assume the planned housing and migration
  patterns happen.
* **Places are licensed capacity, not vacancies.**
* **Straight-line distances.** Distances are measured from SA2 label points,
  not along roads.
* **School campuses are counted, not their enrolment capacity.**
