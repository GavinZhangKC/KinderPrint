# ADR-004 — Investigation Priority threshold (V1)

**Date:** 2026-08-30 · **Status:** Accepted · **Owner:** MDS lead

## Decision
Retain the V1 Higher Investigation Priority threshold at z >= 1.28, producing
**20 of 342 analysable communities (5.8%)**.

## Rationale
The Higher band is deliberately selective. It is an actionable investigation
shortlist for a practitioner with finite time, not a general classification of
disadvantage. A band containing 30% of communities would not narrow a decision.

## Pre-registration
The threshold was fixed **before** environmental results were reviewed, to
reduce outcome-driven threshold adjustment. This record is the evidence of
that sequence; commit history corroborates the date.

## Bands
| Band | Rule | n |
|---|---|---|
| Higher | z >= 1.28 (approx. 90th percentile of the standard normal) | 20 |
| Moderate | 0.5 <= z < 1.28 | 67 |
| Lower | z < 0.5 | 255 |

## Review
Suitability to be evaluated by (a) DS-16.1 threshold sensitivity analysis
reporting top-k stability, and (b) DS-18.1 practitioner feedback on shortlist
size. If either indicates the band is mis-sized, the change and its trigger
will be recorded as V2 in MODEL_EVOLUTION_LOG.md.

## Consequence
Reported as a band, never a score. The API contract forbids numeric priority
values, and validation.py enforces it.
