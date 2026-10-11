# ADR-010: Plan a change replaces the straight-line Simulation model

**Date:** 2026-10-11 · **Status:** Accepted · **Owner:** MDS lead

## Context

The Simulation page fitted ordinary least squares of AEDC results on five place
features in the browser (P0) and showed slider changes as changes in outcomes.

Three problems were measured or confirmed:

* **Disadvantage was mistaken for place.** 65.5% of its tree-cover slope was
  explained by disadvantage (IRSD), which it ignored.
* **It extrapolated.** It produced answers for combinations no Melbourne area
  has.
* **Its intervals were not calibrated.**

The team wanted a "planned solution" view that looks ahead to 2027.

## Decision

* **Matched-pair analogues (P2).** Compare areas already near the planned level
  with similar areas near today's level, paired on IRSD and children assessed.
  Report the mean paired gap with a bootstrap interval, widened until shuffled
  data gives "clear" results only at the chance rate of 20%.
* **Never claim cause.** No result moves the 2027 forecast. The forecast is
  shown beside the comparison as context.
* **Refuse rather than extrapolate.** No result when the planned level is
  beyond every Melbourne area, or when fewer than 5 matched pairs exist.
* **Blocking gates:** coverage ≥ 60%, balance ≥ 80%, reproducible output, and
  all reference searches published.
* **Shared pure-Python engine.** The backend copies the engine verbatim, and a
  test fails if the two copies differ.

## Consequences

* Coverage is 71.1% and 90.5% of results are balanced.
* Most heat and traffic plans show "no clear difference". Tree cover shows a
  modest signal above chance.
* The page is more honest and less dramatic than P0. That is the intended
  trade-off.
