# ADR-006 — Remove IRSD from the matching metric (M3 → M4)

**Date:** 2026-08-30 · **Status:** Accepted · **Supersedes:** M3

## Context

The project states a rule: *IRSD is constructed from Census income, education,
employment, housing and family composition, so IRSD and those variables must never
enter the same distance metric or composite.*

An audit found the shipping code broke it. M3's feature set was:

```
irsd_score, median_hh_income_weekly, unemployment_rate,
one_parent_family_pct, children_0_4_pct, median_age, avg_household_size
```

IRSD sat alongside three of its own constituents. Measured:

| | |
|---|---|
| VIF, `irsd_score` | **9.43** |
| Correlation, IRSD ↔ income | **+0.83** |
| Correlation, IRSD ↔ unemployment | **−0.76** |
| Correlation, IRSD ↔ one-parent families | **−0.76** |
| Condition number of the correlation matrix | **45.7** |

## Complication

Mahalanobis distance is *designed* to handle correlated features — the inverse
covariance matrix downweights redundant dimensions. So the double-counting argument
that clearly applies to a composite index or Euclidean distance does not obviously
apply here. The violation might have been theoretical.

It was tested rather than assumed.

## Candidates evaluated

| | Features |
|---|---|
| **M3** | IRSD + 6 Census/demographic (current) |
| **M4a** | 7 Census/demographic, no IRSD |
| **M4b** | IRSD + `irsd_sa1_spread` + 3 demographic, no IRSD constituents |

## Evidence

| Metric | M3 | **M4a** | M4b |
|---|---|---|---|
| max VIF | 9.43 | **4.13** | 2.10 |
| condition number | 45.7 | **29.5** | 7.5 |
| max group SMD | 0.025 | **0.021** | 0.026 |
| max per-pair SMD | **0.323** | 0.361 | 0.440 |
| stability, 5% jitter × 25 reps | 76.2% | **79.2%** | 79.8% |
| stability, leave-one-feature-out | **70.9%** | 69.0% | 59.9% |
| match coverage | 79.8% | 79.8% | 79.8% |
| pairs identical to M3 | — | 58.3% | 38.4% |

Two notes on interpretation. Per-pair SMD favours whichever metric most directly
minimises standardised distance, so M3's small advantage there is partly circular.
And M4b's poor leave-one-out stability is expected: with five features, dropping one
removes 20% of the information.

## Decision

**Adopt M4a.** Renamed **M4**.

```
median_hh_income_weekly, unemployment_rate, one_parent_family_pct,
no_qualification_pct, children_0_4_pct, median_age, avg_household_size
```

Reasons, in order of weight:

1. **It obeys the stated rule.** Code that contradicts its own documented method is a
   defect regardless of whether the effect is measurable.
2. **Better conditioned.** VIF 9.43 → 4.13. `pinv` on a near-singular covariance
   matrix amplifies noise.
3. **More stable under measurement error.** 76.2% → 79.2% of communities keep the same
   peer under 5% jitter. Census values are themselves perturbed by the ABS, so
   robustness to small input changes is not hypothetical.
4. **Better group balance.** Max group SMD 0.025 → 0.021.
5. **IRSD becomes an out-of-sample check.** This is the strongest argument and it was
   not anticipated. Under M3, peers agreed on IRSD *because they were matched on it* —
   circular. Under M4, IRSD is not an input, so agreement is independent evidence:

   | | M3 (in-sample) | **M4 (out-of-sample)** |
   |---|---|---|
   | IRSD correlation between peers | 0.948 | **0.889** |
   | Peers within one IRSD decile | 82.4% | **74.7%** |
   | Mean absolute IRSD gap | 16.9 | **22.0** |

   M4's numbers are lower, and worth far more. A model that reproduces IRSD similarity
   *without being shown IRSD* has demonstrably captured socioeconomic similarity.

Cost accepted: per-pair raw similarity is slightly worse (0.323 → 0.361), and
leave-one-out stability drops marginally (70.9% → 69.0%).

## Consequence

**42% of matched pairs changed.** Downstream results move:

| | M3 | M4 |
|---|---|---|
| Matched pairs | 273 | 273 |
| `no_match` | 69 | 69 |
| Significant AEDC differences | 69 | 61 |
| Environmental difference records | 798 | 792 |

Headline pairs that changed: Collingwood's peer moved from Fitzroy to Richmond –
North; Hallam from Hampton Park – West to Dandenong North; Belgrave – Selby from
Upwey – Tecoma to Croydon Hills – Warranwood. Bentleigh East – North ↔ Bentleigh –
McKinnon and Glenroy – East ↔ Hadfield were unchanged.

All are geographically and socially plausible. Any figure or narrative produced under
M3 must be regenerated; the pipeline does this automatically.

## Enforcement

`assert_no_leakage()` in `src/kinderprint/analytics/matching.py` raises on any feature
set containing IRSD alongside a constituent, or containing an environmental or outcome
variable. It is called on every pipeline run and covered by three tests. M3's feature
set is retained in the module and the test asserts that it is *rejected*, so the
violation cannot silently return.

## Scope of the rule

The rule stands for composite indices, Euclidean distance and regression coefficients.
For Mahalanobis it is partly redundant by construction — but "partly" is not "wholly",
and the conditioning, stability and out-of-sample validation arguments hold
independently of the double-counting one.
