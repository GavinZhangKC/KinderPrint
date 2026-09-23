# Digital health condition page data contract

The Child Health Conditions page combines validated aggregate health context with
general prevention guidance. It must not be interpreted as an individual health
record, diagnosis, treatment plan or prediction.

## Local health indicators

The locality currently shown in the prototype is Brunswick East SA2 (`206011106`).
Clinical context comes from its containing Population Health Area, Brunswick /
Brunswick East (`20001`), using the validated PHIDU child-health extract:

- childhood asthma, mental-health conditions and long-term conditions: 2021
  self-reported prevalence;
- childhood overweight and obesity: 2022 modelled estimates, retaining the
  published confidence interval;
- immunisation: 2023 administrative coverage;
- low birthweight and smoking during pregnancy: pooled 2019–2021 observations;
- infant mortality: pooled 2019–2023 observations;
- respiratory emergency presentations: 2022/23 counts by published age group.

PHA results remain labelled as regional context. They are never copied to the SA2
or described as a Brunswick East SA2 estimate. AEDC child-development values are
the only health/development measures on this page reported at SA2.

Source files:

- `data/processed/phidu_child_health_pha.csv`
- `data/processed/child_youth_health_context_pha.csv`
- `data/processed/phidu_pha_sa2_bridge.csv`

## Nearby care

Facility name, service type and coordinates come from the 7 March 2025 National
HealthDirect Health Facilities extract in
`data/processed/healthdirect_facilities.csv`. Distances are great-circle,
straight-line distances from the Brunswick East reference point
(`-37.769, 144.976`), rounded to two decimals. They are not road distance or travel
time.

The public extract does not provide current consultation prices, bulk-billing
eligibility, appointments, capacity or verified paediatric specialist staffing.
The interface therefore says `Contact clinic` rather than estimating a fee.

## Prevention and seasonal guidance

Guidance is deliberately general and links clinical decisions back to a qualified
professional. Authoritative references include:

- Better Health Channel, *Asthma action plans*:
  https://www.betterhealth.vic.gov.au/health/conditionandtreatments/asthma-action-plans
- Victorian Department of Health, *Epidemic thunderstorm asthma risk forecast*:
  https://www.health.vic.gov.au/environmental-health/epidemic-thunderstorm-asthma-risk-forecast
- Healthdirect, *Bulk billing for medical services*:
  https://www.healthdirect.gov.au/bulk-billing-for-medical-services

The interface must not recommend a medicine, dose, diagnosis or treatment for an
individual child.
