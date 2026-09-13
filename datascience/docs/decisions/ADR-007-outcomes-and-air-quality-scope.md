# ADR-007: Primary outcome and air-quality fallback

**Status:** Accepted

**Date:** 13 September 2026

## Decision

KinderPrint uses the existing AEDC 2009–2024 aggregate dataset as its primary
child-development outcome source. Additional clinical outcomes such as asthma,
respiratory presentations, hospitalisations, obesity, physical activity and mental
wellbeing are optional extensions. Their absence does not block the product.

The EPA Environment Monitoring API key is also not a delivery dependency. Historical
air-quality analysis uses EPA Victoria's publicly downloadable yearly hourly-average
workbooks where they pass validation. The 2018–2025 workbooks have been acquired from
DataVic for assessment.

## Outcome rules

- AEDC remains an area-level child-development outcome, not an individual prediction.
- Suppressed AEDC results remain suppressed and are never imputed.
- Environmental associations do not establish causation.
- Missing clinical outcome data is reported as unavailable, not low risk.
- A clinical extension must retain its published geography and suppression rules.

## Air-quality rules

- Station observations are not assigned to an SA2 merely because a station is nearest.
- Interpolation requires adequate spatial/temporal coverage, cross-validation and a
  documented method appropriate to each pollutant.
- If those tests fail, the product reports air quality as `INSUFFICIENT_EVIDENCE` or
  `PLANNED`; it does not manufacture locality estimates.
- The live API, if later available, supports current conditions, forecasts and notices.
  It is not required for historical AEDC hypothesis testing.
- The historical workbooks require schema normalisation because 2018–2020 use a long
  observation table while 2021–2025 use station-specific wide worksheets.

## Consequences

Data engineering, statistical analysis, backend contracts and the rest of the product
continue using AEDC while air-quality EDA proceeds independently. Optional clinical data
can be added later without changing the primary outcome contract.
