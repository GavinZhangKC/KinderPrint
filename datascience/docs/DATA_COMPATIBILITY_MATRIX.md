# KinderPrint — Data Compatibility Matrix

**Status:** first pass, pre-download. Every cell marked `?` must be resolved by
inspecting the real file. No join may be written in code until the relevant row
is resolved.

**Rule:** this document has veto power over the pipeline. If a join is rated
**BLOCKED** here, the code does not perform it, regardless of how convenient it
would be.

---

## Part A — Per-dataset compatibility attributes

| Attribute | ASGS Ed 3 | AEDC SA2 | SEIFA 2021 | Census 2021 GCP | SILO max_temp | DEA Land Cover v2 |
|---|---|---|---|---|---|---|
| Native geography | SA2 polygon | SA2 | SA2 (from SA1) | SA2 (from SA1/MB) | 0.05° grid | 30 m raster |
| ASGS edition | Ed 3 (2021) | Ed 3 (2021) ? | Ed 3 (2021) | Ed 3 (2021) | n/a | n/a |
| Reference year | 2021 | 2024 (cycle 6) | 2021 | 2021 | window TBD | annual to 2025 |
| Release year | 2021 | 2025 | 2023 | 2022 | rolling | 2026 |
| Temporal type | snapshot | 3-yearly cycle | 5-yearly | 5-yearly | daily | annual |
| Unit of measure | n/a | % of children | index score | counts | °C / days | class code |
| Denominator published | n/a | **?** | n/a | yes | n/a | pixel count |
| Missing encoding | n/a | ? | ? | ? | `_FillValue` | 255 |
| Suppression | n/a | small child counts, rule **?** | low-pop SA1 excluded | random perturbation | none | none |
| Effective resolution | SA2 | SA2 | SA2 | SA2 | **~5 km — coarser than urban SA2** | 30 m — finer than SA2 |
| Licence | CC-BY-4.0 | AEDC Data Guidelines **?** | CC-BY-4.0 | CC-BY-4.0 | CC-BY-4.0 | CC-BY-4.0 |

---

## Part B — Pairwise join assessment

Ratings: **OK** (join directly) · **CONDITIONAL** (join only with the stated
transformation and a recorded caveat) · **BLOCKED** (do not join).

| From | To | Join key | Rating | Condition / reason |
|---|---|---|---|---|
| AEDC 2024 | ASGS Ed 3 SA2 | SA2 code | **CONDITIONAL** | Confirm AEDC's SA2 codes are Ed 3 (2021), not Ed 2 (2016). Measure unmatched codes on both sides; a non-zero unmatched count is a finding, not a rounding error. |
| SEIFA 2021 | ASGS Ed 3 SA2 | SA2 code | **OK** | Both Ed 3, same reference year. |
| Census 2021 | ASGS Ed 3 SA2 | SA2 code | **OK** | Both Ed 3, same reference year. |
| AEDC 2024 | SEIFA 2021 | SA2 code | **CONDITIONAL** | 3-year offset. Acceptable for *relative* socioeconomic position, which is stable in most SA2s. NOT acceptable without a flag in high-growth SA2s — compute 2016→2021 population change and flag the top decile of growth. |
| AEDC 2024 | Census 2021 | SA2 code | **CONDITIONAL** | Same 3-year offset caveat. |
| SILO | ASGS Ed 3 SA2 | spatial | **CONDITIONAL** | Population-weighted zonal statistics only. Area-weighted means are rejected. Record the effective number of grid cells per SA2; where it is <2, mark the SA2's heat indicator `low_spatial_support`. |
| DEA Land Cover | ASGS Ed 3 SA2 | spatial | **CONDITIONAL** | Must be masked to the populated portion of the SA2. Unmasked area-share is rejected as an exposure measure. |
| SILO | DEA Land Cover | — | **N/A** | Never joined to each other; both join independently to SA2. |
| Any 2021-edition data | ASGS **Ed 4** SA2 | SA2 code | **BLOCKED** | Edition 4 boundaries differ. Codes will partially match and produce silently wrong results. Requires an official ABS correspondence file and a documented apportionment method. Out of scope for Iteration 1. |
| AEDC | Individual-level anything | — | **BLOCKED** | Out of ethical scope. |

---

## Part C — Open questions blocking the pipeline

| # | Question | Blocks | How to resolve | Status |
|---|---|---|---|---|
| Q1 | Does the AEDC SA2 file publish child counts per SA2? | Epic 4 uncertainty; all significance testing | Counts inspected in `sa2-2009-24.xlsx`; see `reports/DS03_aedc_profile.md` | **RESOLVED — YES** |
| Q2 | Is a child assigned to SA2 of **residence** or **school**? | Every environmental join's interpretation | Confirmed as residence-based; recorded in the integrated source register | **RESOLVED — RESIDENCE** |
| Q3 | What is AEDC's exact suppression threshold and how is it encoded? | Missing-data handling, coverage stats | File footers inspected; `#` and `*` semantics recorded in `reports/DS03_aedc_profile.md` | **RESOLVED** |
| Q4 | Which ASGS edition do the AEDC SA2 codes use? | The primary join | Content and code-match test confirm Edition 3 (2021) | **RESOLVED — ED. 3** |
| Q5 | What do the AEDC Data Guidelines permit for public re-display? | Whether KinderPrint can show AEDC at all | AEDC Data Guidelines document | OPEN |
| Q6 | Heat threshold: fixed (e.g. ≥35 °C) or relative (TX90p percentile)? | Heat indicator definition | Literature + `docs/methodology/heat_indicator.md` decision record | OPEN |
| Q7 | Which DEA classes count as "vegetated", and Level 3 or Level 4? | Vegetation indicator definition | DEA product documentation | OPEN |

---

## Part D — Coverage ledger

Populate after every join. A join that loses rows silently is a defect.

| Join | Left rows | Right rows | Matched | Left-only | Right-only | Coverage % | Verdict |
|---|---|---|---|---|---|---|---|
| aedc → asgs | | | | | | | |
| seifa → asgs | | | | | | | |
| census → asgs | | | | | | | |
| silo → asgs | | | | | | | |
| dea → asgs | | | | | | | |
| **analytical table (all)** | | | | | | | |

The final row is the one that matters: the number of SA2s with a **complete**
set of indicators is the real study population, and it will be smaller than the
number of SA2s in Australia. Report it prominently; do not impute your way to a
bigger number.
