# ACECQA spatial linkage

KinderPrint uses an authoritative identifier linkage before considering address
geocoding. The ACECQA Victorian register identifies services with approval numbers such
as `SE-40019066`. Vicmap Features of Interest supplies the same identifier in
`auth_org_id` for child-care features maintained under authority code `101`.

## Linkage audit

Snapshot date: 13 September 2026.

| Check | Result |
|---|---:|
| ACECQA Victorian services | 5,016 |
| Vicmap child-care points labelled VIC | 5,084 |
| Vicmap points with authority ID | 5,084 |
| Unique Vicmap authority IDs | 5,084 |
| Exact ACECQA-to-Vicmap matches | 4,827 |
| ACECQA exact-match coverage | 96.23% |
| Duplicate matched authority IDs | 0 |
| Unresolved ACECQA services | 189 |

The 189 unresolved services are not assigned postcode centroids and are not fuzzy
matched by name. They remain `UNRESOLVED_NO_AUTHORITATIVE_POINT` until an approved
geocoder or updated Vicmap record is available.

## Interpretation rules

- `NumberOfApprovedPlaces` is licensed capacity, not vacancies or guaranteed access.
- A current NQS rating describes the published service assessment; absence of a rating
  is not a poor rating.
- Temporarily closed services remain in provenance output but do not count as currently
  available services.
- Straight-line distance from an SA2 representative point is a reproducible proximity
  descriptor, not travel time or household-level access.
- Service counts are not affordability, cultural safety, opening-hours suitability or
  enrolment availability measures.

Only exact authority-ID matches may enter the coordinate-backed processed layer. Any
future geocoded records must identify the geocoder, match precision, confidence,
licensing/caching terms and review outcome separately.
