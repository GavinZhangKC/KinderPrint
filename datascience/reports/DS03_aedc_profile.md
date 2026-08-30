# DS-03.1 — AEDC SA2 dataset profile

**File:** `sa2-2009-24.xlsx`
**SHA-256:** `4ffd8d5882f8e2f35d59eb2dae4d2bd0dab0e2afe4ac118b5913a6110c6ae8f9`
**Size:** 6,023,948 bytes · **Accessed:** 2026-08-28
**Raw path:** `data/raw/aedc/2026-08-28/sa2-2009-24.xlsx` (immutable)

---

## 1. Structure

12 sheets. `Contents` is empty of parseable data. The remaining 11 split into two shapes:

| Sheet group | Sheets | Cols | Content |
|---|---|---|---|
| **Domain sheets** | SA2 Health, Social, Emotional, Language, Communication | 45 | Children with valid scores + on track / at risk / vulnerable, each as n **and** % |
| **Summary sheets** | One or more, Two or more, On track five | 21 | Children with valid scores + a single vulnerable/on-track n and % |
| **Subdomain sheets** | Health 1, Health 2, Health 3 Subdomain | 21 | Physical health subdomains |

Every sheet: 6 junk rows, then a **two-row merged header** (row 5 = measure group, row 6 = year), then data. Six collection cycles per sheet: 2009, 2012, 2015, 2018, 2021, 2024.

`openpyxl.load_workbook()` **fails** on this file — it references `xl/drawings/drawing1.xml` which is absent from the archive. Use `pandas.read_excel` with `header=None, skiprows=6`.

---

## 2. The four open questions — resolved

### Q1 — Are child counts published? **YES.**

Columns 3–8 of every sheet are `Number of children with valid scores` for 2009…2024. This is the denominator. Confidence intervals, the AEDC critical difference, and significance-tested pair comparison are all now possible.

**Consequence:** Epic 4 survives as designed. DS-12.2 is unblocked.

### Q2 — Residence-based or school-based assignment? **STILL OPEN.**

Not answerable from this file. Must be read from the AEDC Data Dictionary. This remains the one unresolved item and it governs how every environmental join is interpreted.

### Q3 — Suppression rule? **RESOLVED — documented in the sheet footer.**

Two markers appear in value cells:

| Marker | Meaning (verbatim from the file) | Count in Health sheet |
|---|---|---|
| `#` | Data are not reported for locations in which three or fewer children had been assessed | 83 |
| `*` | Suppression also occurs where any of: fewer than fifteen children had valid AEDC scores; fewer than two teachers completed Instruments for children in that location; Instruments completed for less than 80% of all non-special-needs children | 3,186 |

Plus "additional minor suppressions … to preserve confidentiality of related areas."

Also present, rarely: `≤2`, `≤10`, `≥20`, `≥90` (6 cells total) — bounded values, not missing. These must not be coerced to numeric.

**No blank cells at all** in the value block (0 of 112,014). Missingness is entirely marker-encoded.

### Q4 — ASGS edition? **Edition 3 (2021), confirmed by content.**

The file covers **2,454 distinct 9-digit SA2 codes** against 2,473 published in ASGS Edition 3 — a 19-code gap consistent with special-purpose codes (migratory/offshore/no usual address).

Decisive evidence: the file contains SA2s that only exist in Edition 3 — `213041572 Cobblebank - Strathtulloh`, `213041576 Kurunjang - Toolern Vale`, `209041531/532 Mernda - North / Mernda - South`, `212031555/556 Clyde North` splits. These are Edition 3 creations in Melbourne's growth corridors.

**Consequence:** the join to ASGS Edition 3 boundaries is clean. Compatibility matrix row `aedc → asgs_ed3` moves AMBER → GREEN, subject to the code-match assertion at ingest.

---

## 3. Finding not anticipated: mixed geography levels in one sheet

Rows are interleaved across three levels and must be filtered:

| Row type | Identifier pattern | Count (Health sheet) |
|---|---|---|
| State/Territory header | text name, e.g. `Victoria` | 8 |
| SA3 | 5-digit code | 336 |
| **SA2** | **9-digit code** | **2,210** |
| **Merged SA2 group** | two or more 9-digit codes joined by `/` | **119** |
| Footnotes | prose | ~8 |

Naive ingestion would silently mix SA3 and SA2 rows into one table. Filter on `^\d{9}` and treat 5-digit rows as a separate hierarchy.

---

## 4. Finding that matters most: merged SA2 groups

AEDC publishes 119 rows nationally where two, three or four SA2s are combined into a single reporting unit — presumably to meet the 15-child minimum. **13 of these are in Greater Melbourne:**

| Merged group | Type |
|---|---|
| Port Melbourne / Port Melbourne Industrial | residential + industrial |
| Moorabbin - Heatherton / Moorabbin Airport | residential + airport |
| Mordialloc - Parkdale / Braeside | residential + industrial |
| Airport West / Essendon Airport | residential + airport |
| Tullamarine / Melbourne Airport | residential + airport |
| Glenroy - West / Gowanbrae | small residential pair |
| **Epping (Vic.) - West / Wollert** | **growth corridor** |
| **Mernda - North / Mernda - South** | **growth corridor** |
| **Craigieburn - North / Craigieburn - North West** | **growth corridor** |
| **Cranbourne East - North / Cranbourne East - South** | **growth corridor** |
| **Cranbourne North - West / Clyde North - South / Clyde North - North / Cranbourne North - East** | **growth corridor (4 SA2s)** |
| **Rockbank - Mount Cottrell / Cobblebank - Strathtulloh** | **growth corridor** |
| **Kurunjang - Toolern Vale / Fraser Rise - Plumpton** | **growth corridor** |

Two distinct causes. The airport/industrial pairs are low-population areas bolted onto a neighbour. **The other seven are outer growth corridors** — the same category as Tarneit, and precisely the communities KinderPrint is most interested in.

**This is a real geographic harmonisation problem, and it is your DS-05 evidence.** Options:

| Option | Effect |
|---|---|
| **A. Dissolve the ASGS geometry to match** (recommended) | Merge the component SA2 polygons into one analysis unit; environmental and Census values aggregate to the same merged unit. Preserves all 346 Melbourne rows. Costs: 13 units are larger than a standard SA2 |
| B. Drop merged rows | Loses seven growth-corridor communities — the most interesting cases. Rejected |
| C. Split AEDC values back across component SA2s | Invents data. Rejected |

Option A means your analysis unit is "AEDC reporting area" — usually an SA2, occasionally a dissolved group of 2–4. Document that in the data dictionary and it is defensible; leave it undocumented and it is a silent error.

---

## 5. Greater Melbourne study population

Filtering to SA4 codes 206–214:

| Measure | Value |
|---|---|
| AEDC reporting areas (SA2 rows) | **346** (333 single, 13 merged) |
| Suppressed in 2024 | **4 (1.2%)** |
| **Usable study population** | **342** |
| Median children per area (2024) | 122 |
| IQR | 80 – 170 |
| Range | 16 – 1,028 |
| Areas with n < 50 | 32 (9.4%) |
| Areas with n < 100 | 126 (36.8%) |

**Headline indicators, 2024, Greater Melbourne:**

| Indicator | Median | Range |
|---|---|---|
| Vulnerable on one or more domains | 19.9% | 0.0 – 50.8% |
| Vulnerable on two or more domains | 9.8% | 0.0 – 41.3% |
| On track on all five domains | 55.8% | 24.0 – 93.9% |

Recommend **"vulnerable on one or more domains"** as the primary outcome — it is the AEDC's own headline measure, has the widest spread across areas, and is the least suppressed.

---

## 6. Consequence for the imputation question

Only **4 of 346** Greater Melbourne areas are suppressed on the headline 2024 indicator. The missing-data problem that motivated imputation does not materially exist at this scope. Exclude the 4, report them as "data not available", and the study population is 342 areas — ample.

Imputation is therefore both unnecessary and unjustifiable here. That is now an evidenced statement, not a principle.

---

## 7. Consequence for comparison claims (uncertainty)

95% Wilson confidence intervals at real Greater Melbourne sample sizes, for an area showing 22% vulnerability:

| Children in area | 95% CI | CI width |
|---|---|---|
| 39 (5th pct) | 11.9 – 37.2% | 25.3 pts |
| 80 (25th pct) | 14.3 – 32.2% | 17.9 pts |
| 122 (median) | 15.6 – 30.1% | 14.5 pts |
| 170 (75th pct) | 16.4 – 28.8% | 12.4 pts |
| 324 (95th pct) | 17.8 – 26.8% | 9.0 pts |

**At the median area, the 95% CI is roughly ±7 percentage points.** The project brief's worked example — "Community A 32% vs Community B 21%" — is an 11-point gap between two areas whose individual intervals are each ~14 points wide. That comparison sits right at the edge of significance and must not be displayed as a bare difference.

Every pair comparison must carry a significance state. This is now quantified rather than asserted.

---

## 8. Actions

| # | Action | Backlog |
|---|---|---|
| 1 | Read the AEDC Data Dictionary for the residence-vs-school assignment basis | DS-03.1 (Q2) |
| 2 | Update source register: `verified: true`, ASGS Ed 3 confirmed, suppression rule recorded | DS-02.1 |
| 3 | Move `aedc → asgs_ed3` to GREEN in the compatibility matrix; add a new AMBER row for merged reporting areas | DS-02.2 |
| 4 | Build the cleaner: filter `^\d{9}`, unpivot to long, three-state quality flag (`VALUE` / `SUPPRESSED_LT3` / `SUPPRESSED_RULE`), keep bounded values as text | DS-04.1, DS-04.2 |
| 5 | Write the ADR for merged reporting areas (Option A) | DS-05.2 |
| 6 | Download ASGS Edition 3 SA2 boundaries and run the code-match assertion | DS-05.1 |
