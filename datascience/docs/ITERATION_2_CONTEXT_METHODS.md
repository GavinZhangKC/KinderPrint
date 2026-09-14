# Traffic and industrial context methods

These methods produce locality context, not personal exposure, diagnosis or health risk.
The outputs remain outside the backend until their interpretation and API contracts are
reviewed.

## Geographic backbone

All operations use the 361 Greater Melbourne SA2 polygons in ASGS Edition 3 (2021).
Inputs arrive in WGS84 and are projected to Australian Albers (EPSG:3577) before
length or distance calculation. Results are rolled up through the existing audited
SA2-to-AEDC community bridge. Coarse-area values are never disaggregated.

## Declared-road traffic context

Source: DTP Historical Annual Average Daily Traffic Volume 2019.

The source contains 14,662 records and 14,623 segment IDs. Thirty-three rows are exact
segment/direction/geometry duplicates and are removed. Six repeated IDs describe
different geometries and are retained as separate road pieces. Lines are clipped to
Greater Melbourne and intersected with SA2 boundaries.

For each SA2, KinderPrint calculates:

- declared-road kilometres;
- road-length-weighted AADT and heavy-vehicle AADT;
- kilometres and share of declared road at or above 10,000 vehicles per day; and
- road-length share based on `Actual` rather than `Estimated` source methodology.

The 10,000 threshold is an operational descriptor, not a clinical threshold. The layer
does not cover local roads, uses 2019 observations, and mixes measured and modelled
values. `NO_DECLARED_ROAD_DATA` means the source contains no intersecting declared-road
segment. It does not mean there is no traffic.

## National Pollutant Inventory context

Source: NPI Emissions, latest complete workbook year 2024/2025.

The NPI is filtered to Victoria and the latest year before spatial processing. Facilities
with valid published coordinates are converted to points and joined to SA2. KinderPrint
reports facility counts, counts of facilities reporting a respiratory-relevant pollutant,
and straight-line distance from an SA2 representative point to the nearest reporting
facility. Respiratory-relevant matching covers particulate matter, nitrogen oxides,
nitrogen dioxide, sulfur/sulphur dioxide, carbon monoxide and volatile organic compounds.

The pipeline deliberately does not combine kilograms of different pollutants into a
score. NPI reporting thresholds exclude smaller sources, emitted mass is not ambient
concentration, straight-line distance is not a dose model, and zero reporting facilities
does not establish absence of environmental hazard.

## AEDC community roll-up

Road means and shares are weighted by the intersecting declared-road length of each
component SA2. Road kilometres and facility counts are summed. Nearest-facility distance
uses the minimum across component SA2s. Missing traffic remains missing rather than zero.
Every output is labelled `CONTEXT_ONLY`.
