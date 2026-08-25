## Scope

In: numeric scorer entry points (no per-rule `ScoreReport` on identity fast path); reconstruct `ScoreReport[]` from retained rule tuples on threshold pass without re-scoring; remove `captureBreakdown`, `configureScoring`, and `ScoringOptions`; deferred candidates keep full breakdown by `candidateType`; tests assert invocation counts and breakdown parity.

Out: name-matcher token caches (`cache-name-matcher-tokens` — apply first if both open); trigram blocking (`conclusive-mandatory-blocking`); lazy report capture for non-matches (never stored today).

## Language

**Retired:** `configureScoring({ captureBreakdown })` as a public scoring-prep API. Report slice capture remains via `shouldCaptureManagedAccountReportData()` on FusionService; it does not drive scoring mode.

## Decisions

**Context:** Living spec forbids per-rule `ScoreReport` allocation on identity non-matches, but `evaluateRuleTotals` still calls `dispatchRuleScore` → `makeScoreReport`. Threshold passes recurse with `captureBreakdown: true` and score twice. `captureBreakdown: true` on record/report runs builds breakdowns for non-matches that are never stored — pure waste.

**D1: Reconstruct breakdown on pass, do not re-score**
- Combined score pass implies every rule ran once; materialize `ScoreReport[]` from retained numeric tuples.

**D2: Remove captureBreakdown entirely**
- Delete `ScoringOptions`, `configureScoring`, FusionService init call. Identity sweep always uses numeric path. Deferred uses full path by candidate type.

**D3: Full path remains for deferred**
- `candidateType === Deferred` keeps existing `ScoreReport[]` loop unchanged.

## Open Questions

None.
