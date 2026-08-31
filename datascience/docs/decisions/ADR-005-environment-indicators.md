# ADR-005 — Environment indicator definitions

**Date:** 2026-08-30 · **Status:** Accepted · **Supersedes:** the SILO/DEA plan in the original source register

## Context
Iteration 1 needs vegetation, heat and open-space indicators at community level.
The originally planned sources (SILO gridded temperature, DEA Land Cover) had two
defects: SILO's ~5 km grid cannot resolve adjacent urban SA2s, and a DEA
area-share of vegetation measures farmland rather than green space near homes.

## Decision 1 — Source
Use **DELWP Cooling & Greening Melbourne 2018** (Metropolitan Melbourne Urban Heat
Islands and Urban Vegetation), 55,603 polygons on 2016 ABS Mesh Blocks, and the
**VPA Open Space** dataset for metropolitan Melbourne. Both CC-BY-4.0.

Rationale: mesh-block resolution instead of a 5 km grid; urban-focused rather than
statewide; UHI derived from Landsat land surface temperature against a non-urban
baseline; vegetation accuracy stated as better than 90%.

## Decision 2 — Tree canopy, not total vegetation
`PERANYTREE` is the vegetation indicator. **Not** `PERANYVEG`.

Evidence (n=360 SA2s, Spearman against UHI):

| Measure | vs urban heat |
|---|---|
| Tree canopy `PERANYTREE` | **-0.724** |
| Any vegetation `PERANYVEG` | -0.379 |
| Grass `PERGRASS` | **+0.127** |

Trees cool; grass does not. Total vegetation dilutes the signal by mixing them.

This is not academic. Melbourne's hottest communities are Cranbourne East
(+12.75 °C) with 48% total vegetation but **5.7% tree canopy** — lawn without
canopy. `PERANYVEG` would have shown these growth corridors as well vegetated.

## Decision 3 — Geographic harmonisation by spatial overlay
The source is on 2016 mesh blocks; communities are 2021 SA2s. Rather than an ABS
code correspondence, the mesh block polygons are **overlaid directly** on the 2021
boundaries and area-weighted in EPSG:3577 (Albers equal-area).

Rationale: a code crosswalk loses precision at every changed boundary, whereas an
overlay is exact to the geometry and measures its own coverage. `env_coverage_pct`
records what share of each community the source actually reaches.

## Decision 4 — Coverage thresholds
| Coverage | Flag | Behaviour |
|---|---|---|
| >= 90% | `VALUE` | reported |
| 50-90% | `REDUCED_COVERAGE` | reported, limitation attached |
| < 50% | `PARTIAL_COVERAGE` | **value suppressed** |
| no data | `UNAVAILABLE` | suppressed |

Result: 334 of 346 communities carry environment values. The 12 excluded are
peri-urban fringe (Kinglake, Macedon, Romsey, Bacchus Marsh, Wallan, Gisborne,
Riddells Creek, Healesville, Yarra Valley, Koo Wee Rup, Werribee West, Manor
Lakes) where the Cooling & Greening mapping stops at the urban boundary. This is
a stated coverage limit of the source, not a processing failure.

## Decision 5 — Open space inclusion rule
Counted: `OS_TYPE = Public open space` AND `OS_ACCESS = Open` AND
`OS_STATUS = Existing`.
Excluded: restricted public land, tertiary institutions, schools, golf courses,
cemeteries, utilities.

Rationale: the practitioner question is about space a young child can actually
use. A university campus classified as restricted public land is not that.

Polygons are dissolved per community before area is summed, because a single park
appears as several land parcels (Kate Campbell Reserve occupies four rows).

The file's own `HA` column is **not used**. The data arrives in EPSG:3857 (Web
Mercator), where areas near Melbourne are inflated by roughly 60%. All areas are
recomputed in EPSG:3577.

## Consequences
- Environment is Melbourne-only. National expansion would need DEA Land Cover at
  lower detail — recorded in the future opportunity matrix.
- The data is 2018 against AEDC 2024. Defensible: the 2024 AEDC cohort was born
  around 2018-19, so 2018 conditions describe their early-life environment.
- Open space is **not** correlated with disadvantage (rho = +0.077, p = 0.16),
  while tree canopy strongly is (rho = +0.598). Open space therefore carries
  independent information; canopy is partly a disadvantage proxy and must be
  interpreted as such.
