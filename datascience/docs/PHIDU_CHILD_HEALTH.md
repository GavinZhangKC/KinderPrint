# PHIDU child-health integration

KinderPrint uses the PHIDU Social Health Atlas workbook as non-commercial,
aggregate research context. Copyright remains with PHIDU, Torrens University
Australia. The source is licensed under CC BY-NC-SA 3.0 Australia and any adapted
PHIDU-derived dataset must retain attribution and share-alike terms.

## Geographic rule

The outcomes are published for Population Health Areas (PHAs), not SA2s. The
workbook's ASGS 2021 concordance allocates Victoria's 522 SA2s to 276 PHAs. A PHA
value must never be copied to its component SA2s or described as an SA2 estimate.
For environment-health analysis, SA2 environmental measures must first be
aggregated to the PHA geography using a pre-specified defensible weighting method.

## Interpretation boundary

- Census long-term-condition indicators are self-reported aggregate prevalence.
- Childhood overweight and obesity indicators are modelled estimates; confidence
  intervals and relative root mean square error must be retained.
- Reference periods differ by indicator and cannot be treated as contemporaneous.
- Suppressed cells remain suppressed and are excluded rather than imputed as zero.
- Associations are ecological and do not establish individual exposure or causality.
- These data remain `VALIDATED_RESEARCH_CONTEXT_ONLY` until a specific analysis,
  multiplicity policy and interpretation review are completed.

The pipeline publishes a PHA outcome table and a separate SA2-to-PHA bridge to make
the geographic direction explicit. It does not publish an SA2 health-outcome table.
