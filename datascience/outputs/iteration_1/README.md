# KinderPrint data handover v2 — Iteration 1

**Date:** 2026-08-30 · **Scope:** Greater Melbourne · **Status:** verified against `validation.py`, all endpoints returning live data

Supersedes handover v1 (which was CSV + SQL — wrong format, my error).

---

## 1. Verification before you load anything

I ran **your own** `validation.py` and `geography.py` against these files, then hit every endpoint through `TestClient`. Results:

| Validator | Result |
|---|---|
| `load_profiles` | PASS — 346 |
| `load_priority_results` | PASS — 346 |
| `load_explanations` | PASS — 346 |
| `load_comparison_data` | PASS — 346 matches, 273 comparisons |
| `load_boundary_features` | PASS — 346 |

| Endpoint | Status |
|---|---|
| `GET /api/health` | 200 `available` |
| `GET /api/priority` | 200 `limited` |
| `GET /api/neighbourhoods/search` | 200 `available` |
| `GET /api/neighbourhoods/boundaries?bbox=` | 200 `available` |
| `GET /api/neighbourhoods/{id}/profile` | 200 `limited` |
| `GET /api/neighbourhoods/{id}/priority` | 200 `available` |
| `GET /api/neighbourhoods/{id}/explanation` | 200 `limited` |
| `GET /api/neighbourhoods/{id}/match` | 200 `available` |
| `GET /api/neighbourhoods/{id}/boundary` | 200 `available` |
| `GET /api/compare` | 200 `limited` |

`limited` is correct, not a defect: environmental indicators are genuinely unavailable in Iteration 1 and are reported as such rather than filled in.

---

## 2. Install

Copy the five files somewhere readable and set the env vars (see `.env.kinderprint`).

```bash
export KINDERPRINT_PROFILE_DATA_PATH=/data/profiles.json
export KINDERPRINT_BOUNDARY_DATA_PATH=/data/boundaries.geojson
export KINDERPRINT_PRIORITY_DATA_PATH=/data/priorities.json
export KINDERPRINT_EXPLANATION_DATA_PATH=/data/explanations.json
export KINDERPRINT_COMPARISON_DATA_PATH=/data/comparisons.json
uvicorn main:app --reload
```

| File | Size |
|---|---|
| `boundaries.geojson` | 8.8 MB |
| `profiles.json` | 1.2 MB |
| `comparisons.json` | 0.67 MB |
| `explanations.json` | 0.65 MB |
| `priorities.json` | 0.07 MB |

The four CSVs are the same data in tabular form, for the database layer. The backend does not read them.

---

## 3. Two things I need from you

**`neighbourhood_id` format.** The 9-digit SA2 code, e.g. `206071141` (Collingwood). For the 13 communities where AEDC merges SA2s, component codes are joined with **underscores**, e.g. `206041127_206041507`. Underscores rather than slashes because a slash breaks the `/api/neighbourhoods/{id}/profile` route.

**Notice strings.** `responses.py` has `TBC_NOTICE_MESSAGE = "TBC"` for five notices. Approved wording is in `NOTICES.md` — please use it verbatim. That text is the product's scientific framing and it needs to be exact.

---

## 4. Geographic unit

**SA2, ASGS Edition 3 (2021).** Pin Edition 3. ABS released Edition 4 in July 2026 and it is now their default download; Edition 4 SA2 codes partially match Edition 3 codes and will fail silently rather than erroring.

346 communities covering all 361 Greater Melbourne SA2s. Boundaries are already dissolved for the merged areas, so `boundaries.geojson` has one feature per `neighbourhood_id` — no client-side union needed.

---

## 5. What's in each file

**`profiles.json`** — three domains per community, always. Child Development (4 AEDC indicators, 2024) and Social (7 SEIFA/Census indicators, 2021) carry values. Environment carries 3 indicators at `status: "unavailable"` pending handover v3.

**`priorities.json`** — Investigation priority band from model V1. `Higher` 20, `Moderate` 67, `Lower` 255, unavailable 4. Bands only, never a score.

**`explanations.json`** — contributing factors per community, with unavailable inputs named explicitly in `incomplete_inputs`.

**`comparisons.json`** — 346 match records (273 with a peer, 73 `no_match`) and 273 side-by-side comparisons.

---

## 6. Things the UI must surface

**`no_match` is a real answer, not an error.** 73 communities have no peer similar enough to compare fairly. Returning a poor match would be worse than returning none. Please render this as a legitimate state.

**Not-significant differences must stay visible.** Of the 273 matched pairs, **204 (74.7%) have child-development differences that are within sampling variation**. Those carry `difference_not_significant`. If the UI hides that limitation, the product will show practitioners differences that are probably noise. The median community has only 122 children assessed, so a 95% interval spans roughly ±7 percentage points.

**Suppressed data stays suppressed.** 4 communities have no AEDC result because too few children were assessed — a privacy protection. They return `unavailable` with `value: null`. Please show "Data not available", never 0.

---

## 7. Method summary

**Priority (V1).** AEDC vulnerability regressed on socioeconomic position, weighted by children assessed; communities ranked by residual. A first version using percentile overlap correlated 0.795 with disadvantage — it was reproducing a disadvantage map, which the product exists not to be. V1 correlates 0.014. Top-20 overlap between the two is 2/20.

**Matching (M3).** Mahalanobis distance on 7 socioeconomic and demographic measures, matched within SA4, with a distance caliper at the 80th percentile. Environmental measures are deliberately excluded from matching so the differences under investigation are not removed by the matching itself.

**Uncertainty.** Two-proportion z-tests on the AEDC counts. 69 of 273 pair differences are significant at 95%.

---

## 8. Coming in v3

Environmental indicators — urban vegetation cover, urban heat island, public open space — from the Victorian Cooling & Greening Melbourne datasets. Same `neighbourhood_id` key. `profiles.json` and `comparisons.json` will be regenerated; **no code changes needed**, the fields already exist with `unavailable` status.
