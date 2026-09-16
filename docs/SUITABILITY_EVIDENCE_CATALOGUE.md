# Locality suitability evidence catalogue

## Product rule

KinderPrint only enables a locality-ranking checkbox when the repository contains a validated, geographically compatible indicator. A named health condition or nearby clinic must not be treated as evidence that an area is healthier, safer or clinically better for an individual child.

## Currently selectable

| Theme | Measure | Current basis |
|---|---|---|
| Child development | On track in all five AEDC domains | AEDC aggregate SA2 outcome, 2024 |
| Child development | Lower vulnerability on one or more AEDC domains | AEDC aggregate SA2 outcome, 2024 |
| Child development | Physical health and wellbeing on track | AEDC domain-specific SA2 outcome, 2024 |
| Child development | Social competence on track | AEDC domain-specific SA2 outcome, 2024 |
| Child development | Emotional maturity on track | AEDC domain-specific SA2 outcome, 2024 |
| Child development | Language and cognitive skills on track | AEDC domain-specific SA2 outcome, 2024 |
| Child development | Communication skills and general knowledge on track | AEDC domain-specific SA2 outcome, 2024 |
| Environment | Tree canopy | Integrated Victorian environmental indicator |
| Environment | Public open space | Integrated Victorian environmental indicator |
| Environment | Lower urban heat | Integrated Victorian environmental indicator |
| Community context | Greater socioeconomic resources | ABS SEIFA IRSD decile, normalised to the common 0–100 comparison scale |

The five AEDC domains are named in full in the interface: physical health and wellbeing; social competence; emotional maturity; language and cognitive skills (school-based); and communication skills and general knowledge. The official workbook and processed table contain independently rankable 2024 on-track percentages for every domain. These measures were previously present in the processed data but omitted from the API profile artefact; that omission is now corrected.

## Named but withheld

The interface separately identifies the following future evidence families instead of collapsing them into vague labels:

- clinical outcomes: asthma; other respiratory disease; allergy and immune conditions; diabetes and endocrine conditions; healthy weight and nutrition; heart and circulation; neurological; digestive and liver; kidney and urinary; cancer and blood disorders; musculoskeletal; vision; hearing; oral health; mental health; neurodevelopmental conditions; and infectious disease;
- environmental exposures: PM2.5, PM10, nitrogen dioxide, ozone, transport noise, flood and bushfire exposure;
- primary and urgent care: general paediatrics, general practice, Maternal and Child Health, Early Parenting Centres, paediatric urgent and emergency care, children's hospitals and neonatal care;
- paediatric specialties: developmental and behavioural paediatrics, respiratory and sleep medicine, cardiology, neurology and epilepsy, gastroenterology and hepatology, endocrinology and diabetes, nephrology and urology, allergy and immunology, oncology and haematology, infectious diseases and adolescent medicine;
- surgical, sensory and diagnostic care: paediatric surgery, orthopaedics and rheumatology, ENT, ophthalmology and optometry, audiology, child dental care, child-capable imaging and pathology, and clinical genetics;
- mental health, allied health and support: child and adolescent mental health, speech pathology, occupational therapy, physiotherapy, dietetics and feeding, family counselling and care coordination, and paediatric rehabilitation.

These controls remain disabled because KinderPrint does not currently have an approved SA2-level outcome dataset or a verified child-specific service directory containing location, eligibility, capacity, wait time, affordability and quality fields. Facility presence alone is insufficient for a suitability ranking.

## Authoritative classification sources

- [AEDC Data Dictionary](https://www.aedc.gov.au/docs/default-source/default-document-library/2025-aedc-data-dictionary8b9c155b-5dcb-4621-b7da-8b7830bdec10.pdf) — official domain names and variables.
- [Victorian child, youth and family community health services](https://www.health.vic.gov.au/community-health/children-youth-and-families) — care coordination, dietetics, family counselling, physiotherapy, psychology, podiatry, occupational therapy and speech pathology.
- [Victorian Maternal and Child Health Service](https://www.health.vic.gov.au/primary-and-community-health/maternal-and-child-health-service) — Universal MCH, Enhanced MCH, MCH Line and early-parenting services.
- [Healthdirect: paediatricians](https://www.healthdirect.gov.au/paediatrician) — general and specialist paediatric care categories.
- [Victorian Pathway to Good Health service delivery](https://www.health.vic.gov.au/populations/vulnerable-children/pathway-to-good-health-for-children-in-care-service-delivery) — screening areas including immunisation, dental, hearing, vision, asthma, diabetes, allergies, development and mental wellbeing.

Source classifications guide the catalogue only. They do not imply that corresponding locality-level data is available.
