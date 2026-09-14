# Manual data intake

Use this guide only for sources whose public automated route is blocked or requires an
approved account. Never commit credentials, restricted records or identifiable health
data.

## 1. Victoria in Future SA2 projections

Download the exact file named:

`VIF2023_SA2_Pop_Age_Sex_Projections_to_2036_Release_2.xlsx`

Source: <https://www.planning.vic.gov.au/guides-and-resources/Data-spatial-and-insights/discover-and-access-planning-open-data/victoria-in-future>

Place it at:

`datascience/data/raw/vif2023_sa2_age_projections/<download-date>/vif2023_sa2_pop_age_sex_to_2036_release_2.xlsx`

Do not rename or edit the workbook contents. Record the download date. The ingestion
step will calculate the checksum, inspect workbook notes, verify Edition-3 SA2 codes and
derive child-age groups. All resulting values must be labelled `PROJECTED`.

## 2. EPA Victoria Environment Monitoring API

Register through the API resource linked from:

<https://discover.data.vic.gov.au/dataset/environment-monitoring-api>

Keep any key outside Git. When access is approved, add it to a local `.env` file using
the variable name documented by the API provider and tell the project maintainer only
the variable name, base URL, available endpoints and access expiry. Do not send the key
in chat, screenshots, issues or commits.

Also retain the API documentation or Swagger/OpenAPI file if the portal permits it.
KinderPrint needs station identifiers, coordinates, pollutant, units, observation time,
averaging period, validation/quality status, instrument method and outage indicators.

## 3. ACECQA register reuse and geocoding

Obtain written confirmation or a clearly applicable published term covering reuse of:

- service name and address;
- approved places;
- care types;
- current and previous NQS ratings; and
- rating/visit dates.

Source: <https://www.acecqa.gov.au/resources/national-registers>

KinderPrint also needs an approved address-geocoding service. Supply the provider name,
terms, permitted caching duration, attribution wording, rate limits and the local
environment-variable name for its key. Never commit the key. Postcode centroids will not
be substituted for service coordinates.

## 4. Victorian child-health outcomes

Request aggregate data only. Do not request or store names, addresses, dates of birth,
unit records or other identifiable health information.

For each outcome, request:

- exact indicator definition and ICD coding where applicable;
- age range and sex stratification;
- numerator, denominator and published rate;
- reference years and whether the period is pooled;
- smallest approved geography and geographic edition;
- suppression and confidentiality rules;
- confidence intervals or information needed to derive them;
- population coverage and exclusions;
- licence, attribution and display restrictions; and
- an authoritative data dictionary.

Priority outcomes are childhood asthma/respiratory admissions, emergency presentations,
potentially preventable hospitalisations, physical activity, overweight/obesity and
mental wellbeing. An LGA or health-region result must remain at that geography and will
never be copied to SA2.

## Intake checklist

Before moving a manually obtained file into `data/raw`, record:

1. official dataset and publisher name;
2. landing-page and direct-download URLs;
3. access and download date;
4. licence and required attribution;
5. reference period and update frequency;
6. original filename and byte size;
7. geography, geographic edition and identifier field;
8. suppression/missing-value rules; and
9. any written access conditions.

The pipeline will calculate SHA-256 after intake. A changed checksum is reviewed as a
new source release; it is not silently accepted as the same dataset.
