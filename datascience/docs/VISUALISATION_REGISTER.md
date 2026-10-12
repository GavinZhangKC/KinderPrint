# Visualisation register

Each visualisation a user sees, the question it answers, why this form was
chosen, how uncertainty and limits are shown, and how it was checked. Checks
were run at desktop width (1280–1440 px) in light and dark themes with axe-core
(WCAG 2.2 AA): 0 violations on every page listed. Analysis figures used for
model validation are listed at the end.

## In the product

| # | Where | Visualisation | Question it answers | Why this form | Uncertainty and limits shown | Data and geography |
|---|---|---|---|---|---|---|
| 1 | Child Health map | Choropleth of Greater Melbourne with priority layers (development, heat, social disadvantage, vegetation, green space) | Where do I start, and how does my area compare? | Area-level data on a map is the fastest way to find a place and see neighbours | Layers name their source year; profile shows reference periods and data status | AEDC 2024, SEIFA 2021, DELWP 2018, VPA open space; SA2 |
| 2 | Map profile pop-up | Ring for share on track; labelled values for social context and environment | What is this area like for young children? | One number per domain, read in seconds | Each value carries its year and availability | AEDC 2024, SEIFA 2021, environment 2018; SA2 |
| 3 | Practitioner overview | Observed vs expected developmental vulnerability on a labelled 0–60% scale, with the expected range as a band | Is this area doing worse than its case mix predicts? | Position on a shared scale shows distance from expectation, which a number alone does not | Expected range drawn as a band; band label; "teacher-completed snapshot, not an assessment of any child". Scale fixed on 12 Oct 2026 after a review found values over 30% were clipped (Carlton 50.8%) | Priority V2 out-of-fold expectation; SA2 via reporting area |
| 4 | Practitioner overview | Immunisation at 24 months against Victoria and the 95% target | Is coverage short of the target? | A bar with two reference marks answers both comparisons at once | Axis starts at 80% or lower so no value is cut off; register-lag caveat | PHIDU 2023; PHA, labelled as regional |
| 5 | Seasons | Month strip of notifications (influenza, salmonella) and seasonal PM2.5 | When should we prepare, and for what? | Calendar form matches the decision (which months) | Victoria-wide notifications labelled as statewide; air from the nearest EPA monitor, labelled as monitor context | NNDSS public datasets; EPA 2018–2025 |
| 6 | Vaccines | Map of vaccination places within a chosen radius | Where can my child be vaccinated nearby? | Points on a local map support a "where" decision | Straight-line distance, not travel time | Council and HealthDirect listings |
| 7 | Care nearby | Map and list of GPs, pharmacies, urgent care and hospitals | Where do I go, from a cough to an emergency? | Same local map pattern as Vaccines, for consistency | Listing does not confirm availability or fees; emergency figures are hospital-level | HealthDirect 2025, Better Health, MyHospitals |
| 8 | Play today | Hourly strip rating each daylight hour; minutes bar against the movement guideline | When is it a good time to play outside today? | Time on one axis, colour by rating; a bar for progress toward a goal | Rating reasons are listed (heat, UV, air, rain); forecast source named | Open-Meteo forecast; Vicmap play spaces |
| 9 | In 2031 | Choropleth of projected change in children or childcare places per child, with a play-through of years; trend chart for one area | Will services keep up as children grow in number? | Map for where, line for when | Scenario labelled "if nothing new opens"; projections are official, not our forecast | VIF 2023; E2SFCA per projection year |
| 10 | Where to live | Map of matching areas, ranked cards, compare table | Which areas near my chosen suburb fit my priorities? | Ranked list for the decision, map for location, table for side-by-side | Match score labelled as a comparative index; stability label from rerunning the full search; one limitation per card | Family Fit S2 artefact |
| 11 | What if this area changed? | Difference between matched areas with an 80% range, per outcome | How are children doing in similar areas that already have the change? | A difference with its range shows direction and certainty together | Interval calibrated on shuffled data; "does not predict what will happen to any child" | Plan a change P2 |

## Analysis figures (handover)

| Figure | File | Purpose |
|---|---|---|
| Calibration of Priority V2 | `reports/iteration3/figures/v2_calibration.png` | Out-of-fold predicted vs observed by decile; slope 0.99 |
| Funnel plot | `reports/iteration3/figures/v2_funnel.png` | Residuals against precision with the overdispersed limits used for bands |
| Feature importance | `reports/iteration3/figures/v2_importance.png` | Which case-mix features drive the expectation (fold models) |

## Rules applied to every chart

- One typeface (Manrope) and a fixed type scale; colours from the page theme.
- Every chart has a text equivalent (`aria-label` or adjacent text with the values).
- No value is clipped silently: scales cover the data range, or an overflow marker is shown.
- Year, geography and source sit next to each chart.
