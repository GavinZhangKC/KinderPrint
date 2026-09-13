# Iteration 2 data foundation

**Snapshot date:** 13 September 2026

**Geographic contract:** Greater Melbourne, ASGS Edition 3 (2021) SA2 and AEDC reporting areas.

This increment expands discovery and acquisition without publishing unsupported health
claims. A downloaded dataset is not automatically an integrated dataset. Each source
must pass source-specific EDA, licence review, geographic harmonisation and a product
interpretation review.

## Acquired and assessed

| Source | Snapshot result | Integration decision |
|---|---|---|
| DTP historical AADT 2019 | 14,662 road-segment/direction features; GeoJSON; checksum recorded | Candidate only. Intersect with SA2 and define a defensible traffic-exposure metric. The layer omits local roads and mixes measured and estimated values. |
| ACECQA Victorian service register | 5,016 approved services; capacity, care type and NQS fields; checksum recorded | Withheld. It has no coordinate or SA2 field, approved places are not vacancies, and reuse terms require confirmation. |
| National Pollutant Inventory emissions | 1,008,824 national rows; 191,416 Victorian rows; 1,605 Victorian facilities across all years; all Victorian rows have coordinates; checksum recorded | Candidate only. Reported mass is neither ambient concentration nor individual exposure. Pollutant-specific and latest-year processing is required. |
| Victorian school locations 2025 | 2,301 records with coordinates; checksum recorded | Context candidate only. A school-location layer cannot substitute for early-childhood service access. |

Raw source bytes are deliberately ignored by Git. Reproduce downloads with
`python -m scripts.acquire_iteration2 --source <source_id>`. The structured source
register stores exact source URLs, access decisions, limitations and checksums.

## Confirmed access barriers

### Victoria in Future 2023 SA2 age projections

The DTP page publicly advertises an Edition-3 SA2 workbook covering population by age
and sex to 2036. Automated retrieval of the exact publisher link returned HTTP 403 on
13 September 2026, including with a browser user-agent and publisher referrer. The
pipeline records the URL and expected contract but does not fabricate projections.

Source: <https://www.planning.vic.gov.au/guides-and-resources/Data-spatial-and-insights/discover-and-access-planning-open-data/victoria-in-future>

### EPA Victoria environment monitoring API

DataVic documents a CC-BY-4.0 real-time API, but the resource routes through the
Victorian API developer portal and does not expose a reproducible unauthenticated
historical endpoint in its CKAN metadata. API onboarding and coverage evaluation are
required. Station observations must not be represented as an SA2 pollution surface.

Source: <https://discover.data.vic.gov.au/dataset/environment-monitoring-api>

### Small-area child health outcomes

No legitimate public SA2 child-specific hospitalisation/emergency extract was found.
Public Victorian health products commonly use LGA or larger geographies, while linked
unit-record health data requires governance approval. An LGA statistic will never be
copied to its constituent SA2s. Until an approved aggregate extract is obtained, child
health outcome functionality must report `INSUFFICIENT EVIDENCE`, not low risk.

## Next integration gates

1. Validate traffic geometry CRS and directional duplication, then pre-register a road
   exposure method before SA2 overlay.
2. Stream the latest NPI year, validate pollutant-specific missingness and coordinates,
   and build proximity measures clearly labelled as industrial-emission context.
3. Obtain an approved geocoder and confirm ACECQA reuse terms before service-to-SA2
   assignment.
4. Acquire the VIF workbook manually from the exact publisher link if its download
   service remains blocked, then verify Edition-3 identifiers and derive child-age bands.
5. Keep all new product fields unavailable until their source-specific validation tests
   and evidence wording pass.
