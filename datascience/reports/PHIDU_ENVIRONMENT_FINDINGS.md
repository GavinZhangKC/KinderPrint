# Exploratory PHIDU environment-child asthma analysis

Analysable sample: 179 PHAs with complete component-SA2 environmental coverage and published asthma values.

These are unadjusted ecological Spearman associations. They do not estimate individual exposure, establish causality, or support user-facing risk interpretation. Seven pre-specified tests use Benjamini-Hochberg false-discovery-rate correction; confidence intervals are percentile bootstrap intervals (2,000 resamples, seed 5120).

| ID | Feature | n | rho | 95% CI | raw p | BH q | Verdict |
|---|---|---:|---:|---:|---:|---:|---|
| H1 | `length_weighted_aadt` | 179 | -0.247 | [-0.382, -0.096] | 0.0009 | 0.0031 | SIGNIFICANT_OPPOSITE_DIRECTION |
| H2 | `high_traffic_road_share_pct` | 179 | -0.111 | [-0.260, 0.044] | 0.1401 | 0.1961 | NOT_SUPPORTED_AFTER_FDR |
| H3 | `peranytree` | 179 | 0.125 | [-0.039, 0.274] | 0.0964 | 0.1687 | NOT_SUPPORTED_AFTER_FDR |
| H4 | `uhi18_m` | 179 | -0.125 | [-0.273, 0.034] | 0.0951 | 0.1687 | NOT_SUPPORTED_AFTER_FDR |
| H5 | `open_space_pct` | 179 | 0.006 | [-0.158, 0.170] | 0.9382 | 0.9382 | NOT_SUPPORTED_AFTER_FDR |
| H6 | `nearest_npi_respiratory_reporting_facility_km` | 179 | 0.390 | [0.252, 0.524] | 0.0000 | 0.0000 | SIGNIFICANT_OPPOSITE_DIRECTION |
| H7 | `npi_respiratory_reporting_facilities` | 179 | -0.056 | [-0.209, 0.097] | 0.4551 | 0.5309 | NOT_SUPPORTED_AFTER_FDR |

## Guardrails

- PHIDU outcomes remain at PHA geography; no PHA outcome was assigned to an SA2.
- Only PHAs with complete coverage of every component SA2 were analysed.
- SA2 context measures were weighted by VIF2023 2021 population aged 0-14 where appropriate.
- NPI emissions are proximity/reporting context, not ambient concentration.
- EPA station data are not used because no defensible PHA exposure surface exists.
- Socioeconomic and other confounding adjustment is not included in this exploratory screen; findings remain hypothesis-generating.
