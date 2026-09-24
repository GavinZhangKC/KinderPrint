# Child health data discovery and geography policy

Reviewed 24 September 2026.

KinderPrint may use a broader or narrower geography than SA2 only when the
publisher releases a concrete measure at that geography. A broader value is
always labelled with its native geography and is never copied into component
SA2s. A source year and measure definition remain visible with every result.

## Integrated sources

| Source | Health content | Native geography | Child age detail | Use |
|---|---|---|---|---|
| ABS Census 2021 G19 | Long-term asthma, mental-health condition, diabetes, heart, kidney and lung conditions | SA2 | 0–14 | Local condition context. Self-reported, perturbed Census counts; not diagnosis or incidence. |
| AEDC 2024 | Five development domains and summary measures | SA2 / published merged area | School-entry cohort | Primary child-development outcome. |
| PHIDU Child and Youth Atlas 2026 | Immunisation, asthma, weight, perinatal outcomes, emergency presentations and other child/youth indicators | PHA | Indicator-specific | Regional context only; never presented as an SA2 estimate. |
| VCAMS physical health and material-needs indicators | Fruit and vegetable intake, physical activity, screen time, household smoke exposure, special healthcare needs, general health and food insecurity | Victorian Department area | Mostly children under 13; indicator-specific | Broad-area context with RSE quality flags. Values are never allocated to SA2s. |
| VCAMS school-entry and maternal-child-health indicators | Speech/language concern, emotional/behavioural difficulty, breastfeeding and MCH visit participation | LGA | Infant, 3.5-year or school-entry cohort | LGA context with numerator, denominator, privacy suppression and source period preserved. |
| Healthdirect facilities 2025 | General practice, hospital and pharmacy locations | Point joined to SA2 | Not applicable | Listed service presence and straight-line proximity only. |
| Victoria in Future 2023 | Child population projections | SA2 | Five-year age bands | Future service-planning denominator. |

## Validated candidates for a later integration

| Source | Available geography | Decision |
|---|---|---|
| AIHW regional mental-health service activity profiles | SA3 and PHN, with age groups | Strong candidate for service-use context. Export is available through the dashboard. It must remain SA3/PHN and must not be interpreted as prevalence. |
| AIHW potentially preventable hospitalisations 2017–18 to 2023–24 | SA3 and PHN | Strong system-performance context, but published totals require age-detail validation before being described as child health. |
| Victorian Public Health and Wellbeing Outcomes dashboard | Geography varies by indicator | Current authoritative candidate. Each downloadable measure needs individual geography, age, year and suppression validation. |
| NDIS autism dashboards and quarterly supplements | Release-dependent | Candidate only if a public table provides both a usable local geography and child age group. Participation is service access, not autism prevalence. |

## Sources not promoted to locality measures

- ABS Data by Region provides current SA2 asthma, diabetes and mental-health
  percentages for all ages. These are useful population context but are not
  child-specific, so they are not substituted for the G19 child age band.
- Victorian Population Health Survey local tables are valuable but older and
  generally not child-specific enough to supersede the integrated sources.
- Monitor-level air quality and facility-level emissions are not converted to
  locality health outcomes.
- Consultation fees, appointment availability and paediatric specialist
  staffing are not present in the public Healthdirect extract and remain
  explicitly unavailable rather than estimated.
- VCAMS weight status is only available in the published workbook for 2014 at
  state/metropolitan/regional level. It is retained as a documented candidate,
  not promoted as current local evidence.
- VCAMS youth access-to-physical, dental and mental-health-service indicators
  currently end in 2016 or 2018 and use broad departmental areas. They are not
  presented as present-day access or capacity.

## New VCAMS integration

The reproducible processor is `scripts/integrate_vcams_child_health.py`. It
creates two deliberately separate contracts:

- `vcams_child_health_area.csv`: 544 observations, eight indicators, 17
  Victorian Department areas and survey years 2013, 2017, 2019 and 2021.
- `vcams_child_health_lga.csv`: 4,316 observations across five indicators,
  retaining LGA identifiers, published numerator/denominator fields and
privacy suppression.

Run it with `--download-missing` to retrieve absent workbooks directly from
the official `content.vic.gov.au` URLs recorded in the script. Raw workbooks
remain local acquisition inputs; the processed contracts, per-file SHA-256
hashes and QA report are versioned.

Survey estimates use the publisher's RSE rule: under 25% is `available`, 25%
to 50% is `use_with_caution`, and over 50% is `unreliable`. Unreliable values
must not be used as headline findings. For the departmental area containing
Brunswick East, the label shown must be **Hume Moreland (Victorian Department
area)**. For LGA measures, the label must be **Merri-bek LGA** or the historical
source label **Moreland LGA**, depending on the reference period.

## Interpretation rules

1. Show `SA2`, `SA3`, `PHA`, `PHN` or point distance beside every value.
2. Do not allocate an SA3, PHA or PHN rate to an SA2.
3. Do not describe service use as disease prevalence.
4. Preserve publisher suppression and perturbation warnings.
5. Do not treat a perturbed Census zero as proof that no children have the
   condition.
6. Do not issue individual diagnosis, treatment or medication advice.
