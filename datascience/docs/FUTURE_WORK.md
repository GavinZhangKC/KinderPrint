# Future opportunities: prioritised and assessed

Each opportunity is rated on value to users, data availability, effort and
risk, with a measurable test of success. Order is by value against effort.

| # | Opportunity | User value | Data availability | Effort | Main risks | Success test |
|---|---|---|---|---|---|---|
| 1 | Add AEDC 2021 as a second cycle in Priority V3 to separate persistent from one-off exceedances | High: practitioners act on persistent signals | Available (same AEDC file) | Low–medium | Boundary changes between cycles; small numbers | Share of Higher areas still Higher in both cycles; practitioner rating of usefulness ≥ 4/5 in a follow-up session |
| 2 | Spatial random effect (BYM2) for remaining residual clustering (Moran's I 0.09) | Medium: fewer clustered false alarms | Available | Medium | Model complexity; harder to explain | Residual Moran's I not significant; spatial-CV MAE no worse than 4.09 pp |
| 3 | Chronological validation of the school-entry outlook when AEDC 2027 is released | High: turns an exploratory outlook into a validated one | Release expected 2028 | Low | Another cycle-wide shock | Observed 80% coverage within 75–85% on the 2024→2027 transition |
| 4 | Travel-time access (road network) instead of straight-line distance | High for growth corridors | OpenStreetMap roads; GTFS for public transport | Medium–high | Compute cost; network quality at the fringe | E2SFCA rankings change for growth-corridor SA2s; users' "nearest" choices match the model in a task test |
| 5 | Correlated draws for AEDC measures in Family Fit stability | Medium: removes the independence assumption | Needs individual-domain covariance; can be estimated from area data | Low | Over-fitting a small sample | Stability labels change for fewer than 10% of reference shortlists, with the change documented |
| 6 | Childcare vacancies or waitlists | Very high for parents | Not public; would need provider data agreements | High | Privacy, licensing, freshness | Agreement signed; vacancies shown for a pilot council with weekly refresh |
| 7 | SA2-level child hospitalisation outcomes | High for practitioners | Requires governance approval for linked data | High | Ethics approval; suppression | Approved aggregate extract with suppression rules matching AEDC practice |
| 8 | Live air quality from the EPA API | Medium | Developer portal registration | Low–medium | Station coverage is sparse; not a locality exposure | API key obtained; Play today air rating agrees with EPA category in ≥ 95% of hours tested |
| 9 | Monitoring page for pipeline and data health (admin) | Medium for the team after handover | All inputs exist (KPIs, QA reports, run records) | Low | Exposure of internals if public | Hidden route behind team access; shows last run, KPI status and failed requests |
| 10 | Repeat the user evaluation after handover with more practitioners | High for evidence | Recruitment | Low | Convenience sample | n ≥ 10 including ≥ 3 practitioners; same tasks, paired comparison |

## Deliberately out of scope

- Rent and housing cost in Where to live: moves the product away from child health.
- Individual-level prediction or diagnosis: outside the ethical scope of area data.
- Copying regional (PHA, LGA) values to SA2s to fill gaps.
