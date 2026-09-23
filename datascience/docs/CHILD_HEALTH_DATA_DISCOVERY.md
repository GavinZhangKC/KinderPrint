# Child health data discovery and geography policy

Reviewed 23 September 2026.

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

## Interpretation rules

1. Show `SA2`, `SA3`, `PHA`, `PHN` or point distance beside every value.
2. Do not allocate an SA3, PHA or PHN rate to an SA2.
3. Do not describe service use as disease prevalence.
4. Preserve publisher suppression and perturbation warnings.
5. Do not treat a perturbed Census zero as proof that no children have the
   condition.
6. Do not issue individual diagnosis, treatment or medication advice.
