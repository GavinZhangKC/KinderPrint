# Digital health condition page data contract

The Child Health Conditions page combines validated aggregate health context with
general prevention guidance. It must not be interpreted as an individual health
record, diagnosis, treatment plan or prediction.

## Local health indicators

The user selects a supported Greater Melbourne SA2. Exact condition responses come
from ABS Census 2021 table G19 for children aged 0–14. The selected SA2 is then
resolved through the validated `phidu_pha_sa2_bridge.csv`; broader clinical context
comes from that SA2's containing Population Health Area using the PHIDU extract:

- childhood asthma, mental-health conditions and long-term conditions: 2021
  self-reported prevalence;
- childhood overweight and obesity: 2022 modelled estimates, retaining the
  published confidence interval;
- immunisation: 2023 administrative coverage;
- low birthweight and smoking during pregnancy: pooled 2019–2021 observations;
- infant mortality: pooled 2019–2023 observations;
- respiratory emergency presentations: 2022/23 counts by published age group.

PHA results remain labelled as regional context. They are never copied to the SA2.
The interface keeps exact SA2 values and PHA context in separate sections and
refreshes both after every locality change.

The condition groups are decision-oriented rather than diagnostic: users can see
what is actually reported locally, review general prevention/routine information,
and inspect active Healthdirect listings inside the selected SA2. Zero Census
counts are displayed as reported values, not interpreted as absence of disease.

Source files:

- `data/processed/abs_child_health_sa2.csv`
- `data/processed/phidu_child_health_pha.csv`
- `data/processed/child_youth_health_context_pha.csv`
- `data/processed/phidu_pha_sa2_bridge.csv`

## Nearby care

Facility name, service type and coordinates come from the 7 March 2025 National
HealthDirect Health Facilities extract in
`data/processed/healthdirect_facilities.csv`. The page returns active listings whose
validated coordinates fall inside the selected SA2. It does not claim travel
distance or travel time.

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
