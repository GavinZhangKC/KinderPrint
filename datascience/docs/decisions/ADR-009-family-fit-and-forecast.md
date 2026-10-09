# ADR-009: Family Fit S2 ("Where to live") and the 2027 school-entry outlook

**Date:** 2026-10-09 · **Status:** Accepted · **Owner:** MDS lead

## Context

The S0 suitability finder was a modal on the map page. Feedback from the tutor
and design review raised four problems:

* It mixed raw percentages with percentile ranks, so GP and pharmacy access drove
  94% of a "shade + healthcare" search.
* It counted services only inside each border.
* It ignored small numbers of children in AEDC results.
* It returned a bare score with no reasons, uncertainty or limitations.

The product niche is child health and development. Rent and housing cost were
proposed and rejected, because they move the product away from that niche.

## Decisions (fixed before the results were examined)

1. **Its own page** (`/where-to-live`), with a nav item, a home-page entry point
   carrying the chosen focus, and a link from Child Health. The old modal is
   removed.
2. **Eight child-focused needs, two measures each.** Every measure is a
   direction-aligned Greater Melbourne percentile, so no measure dominates. This
   is a blocking gate: each measure must carry 15–35% of the variance in a
   two-need search.
3. **Essential means the median or better** (need score ≥ 50), with weight 2.
   Prefer has weight 1. Suggestions are always Prefer. An Essential is never
   relaxed without the parent choosing a named suggestion.
4. **Empirical-Bayes shrinkage** of AEDC shares (beta-binomial, prior per SA4).
   Validated by a 2021→2024 backtest.
5. **E2SFCA access** for GP and childcare, aggregated to reporting areas.
6. **Stability, not false precision.** A Monte Carlo over the AEDC posterior
   gives a shortlist-position label, shown only for school-entry priorities.
7. **Forecast selection rule.** Five candidates on a rolling-origin holdout; the
   simplest model within 3% of the best wins. Report coverage honestly, even
   when it falls below nominal.
8. **Publish only through gates.** Nine blocking gates must pass; a failure exits
   1 and nothing is written. The backend validates the artefact again and
   refuses an invalid one.
9. **Pure-Python scoring in the API.** The Lambda bundle has no numpy. The
   backend re-implements percentiles and match scores, and a parity test pins it
   to the data-science reference searches.

## Consequences

* The weighting is balanced (22.6–29.3% per measure), border effects are
  credited (16 of 20), and small-area error is 15–22% lower.
* F3 ridge was selected: 14.9% better than persistence, Spearman 0.65. Holdout
  80% coverage is 0.70 because of the 2024 Melbourne-wide fall. The published
  intervals include a cycle-shock term for this.
* School-entry needs correlate with IRSD (0.74 for early development). This is
  disclosed in the model card and on the page ("area-level, never about a
  child"), not hidden.
* Rent is out of scope.
