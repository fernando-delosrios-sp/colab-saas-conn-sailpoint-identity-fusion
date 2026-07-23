## Why

Identity Fusion's Match step compares every managed account against many identity candidates. `compareFusionAccounts` currently allocates a full `ScoreReport[]` plus per-rule report objects for every comparison, then discards them when the combined score fails the threshold. Non-matches dominate (typically >95% of comparisons), so this creates O(accounts × candidates × rules) short-lived objects per aggregation run and unnecessary GC pressure. After capping scoring concurrency, reducing per-comparison allocation on the non-match path is the next high-impact memory optimization with no operator-facing behavior change.

## What Changes

**Non-match comparison path**
- From: Every account–identity comparison allocates `ScoreReport[]` and per-rule `ScoreReport` objects regardless of outcome
- To: Fast path computes combined score using running totals only; full breakdown allocated only when threshold passes or breakdown is explicitly required
- Reason: Eliminate dominant allocation source on non-match comparisons
- Impact: Non-breaking; match outcomes, review forms, and report data unchanged when breakdown is required

**Run-scoped breakdown flag**
- From: No control over when score breakdowns are materialized
- To: `MatchingService.setCaptureBreakdown()` set from `FusionService` during managed-account processing init, combined with deferred-candidate type guard
- Reason: Report capture and deferred scoring still need full breakdowns; normal aggregation identity sweep does not for non-matches
- Impact: Non-breaking; report/dry-run sessions retain current allocation profile

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `matching-service`: Add requirements for fast-path non-match comparison (no breakdown allocation when threshold fails) and run-scoped `captureBreakdown` configuration

## Impact

- **Code:** `src/services/matchingService/matchingService.ts`, `src/services/fusionService/fusionService.ts`
- **Tests:** Extend `src/services/matchingService/__tests__/matchingService.test.ts` (or existing match service tests)
- **Operations:** Lower GC pressure during large aggregations; no config changes for operators
- **Dependencies:** None
