## Why

`uncorrelated-sweep` already scores identity candidates in parallel batches, then applies outcomes **one managed account at a time**. Review-form HTTP and authoritative non-match registration therefore cannot overlap. On aggregations where many accounts become partial matches or non-matches after scoring, STEP wall time is dominated by this serial dispatch, not by the matching algorithms. Operators still wait through the same STEP with `progress=… analyzed` while `ApiQueue` is under-utilized between sequential `createFusionForm` / non-match work.

## What Changes

**Identity-phase outcome dispatch overlaps**
- From: After `scoreIdentityPhase`, `runMatchSweep` awaits `dispatchOutcome` in a strict `for` loop (`src/services/matchingService/matchOutcomeDispatcher.ts`, identity-results loop).
- To: The same `dispatchOutcome` work runs through `promiseAllBatched` with `getFusionParallelBatchSize(config)` (default 12). Exact-match application (`handleExactMatch` → `processFusionIdentityDecision`) is gated so only one automatic merge runs at a time. Partial-match forms and non-match registration may overlap.
- Reason: Scoring is already concurrent; the remaining uncorrelated-sweep cost that is **not** matching is serial outcome I/O and registration.
- Impact: Faster `uncorrelated-sweep` when many identity-phase results need forms or non-match registration. Outcome counts, form contents, and Fusion account keys stay the same. Peak in-flight form/decision HTTP is bounded by the fusion parallel cap **and** `ApiQueue`.

**Unchanged**
- `scoreIdentityPhase` / `scoringMaxConcurrency` / trigram / `scoreFusionAccount`
- Deferred drain: sequential within source, concurrent across sources
- Pre-score gate loop
- `FusionService.processUncorrelatedManagedAccounts` still calls `runMatchSweep` once
- No new connector-spec setting

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `matching-service/match-outcome-dispatch`: Identity-phase outcome dispatch SHALL run in bounded parallel batches independent of `scoringMaxConcurrency`. Exact-match application SHALL remain single-flight. Deferred drain sequential-within-source SHALL remain.

## Impact

- `src/services/matchingService/matchOutcomeDispatcher.ts` — identity-results dispatch loop
- `src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts` — overlap + exact-match serial tests
- Living spec delta under this change folder
- Changelog (user-visible Process duration; no config migration)
- No new dependencies; no connector-spec keys

## Apply status

- **Status**: TODO
- **Depends on**: none
- **Issue**:
