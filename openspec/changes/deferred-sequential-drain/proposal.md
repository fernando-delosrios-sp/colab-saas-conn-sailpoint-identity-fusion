## Why

Deferred matching on second and subsequent `accountList` runs makes no progress: all remaining managed accounts defer again (27 deferred, 0 new non-matches) because the current frozen two-pass algorithm registers every unmatched account into the candidate pool before scoring, so similar accounts form cliques where every peer matches every other peer and none become Fusion account anchors. The 2026 parallel Pass 2 refactor removed the sequential interleaving that previously materialized anchors during the sweep. Operators expect the first unmatched account in a cluster to become a Fusion account and later similar accounts to defer against it—not for the entire cluster to defer indefinitely across runs.

## What Changes

**Deferred resolution model**
- From: Pass 1 registers all pending accounts into `CandidateRegistry`; Pass 2 scores all against a frozen pool in parallel; `handleDeferredMatch` only claims the incoming account.
- To: Per managed source, sequentially drain a pending queue against a mutating pool—no match materializes the incoming account; deferred match claims the incoming account and materializes **all matched pending candidates** as non-match Fusion accounts removed from the pool.
- Reason: Restores anchor extraction and breaks clique deadlock.
- Impact: Behavior change for deferred-enabled authoritative sources; fixes multi-run stall.

**Persisted seed and registry keys**
- From: Registry seeded only from `fusionAccountMap`; keys use `managedKey` (fusion native identity on reload).
- To: Seed from `fusionAccountMap` and `fusionIdentityMap`; prefer `originAccount` composite key when present; persisted entries cannot be overwritten by pending registration.
- Reason: Prior-run anchors must stay visible in the pool on subsequent runs.
- Impact: Non-breaking internal fix supporting correct second-run behavior.

**Parallelism boundaries**
- From: Deferred phase uses same concurrency cap as identity phase across full pending batch.
- To: Identity scoring remains parallel with `scoringMaxConcurrency`; deferred drain is sequential per source (sources may run in parallel).
- Reason: Pool mutation after each account is required for correct semantics.
- Impact: Deferred phase no longer parallel within a source; identity phase unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `matching-service`: Deferred sweep lifecycle, candidate registry registration timing, and anchor materialization rules.
- `matching-service/match-outcome-dispatch`: Deferred match outcome application (materialize pending candidates) and deferred-phase concurrency semantics.

## Impact

- **Code:** `src/services/matchingService/matchOutcomeDispatcher.ts`, `candidateRegistry.ts`, `matchingHelpers.ts`, `src/model/fusionRun.ts`, `src/services/fusionService/fusionService.ts` (`initializeManagedAccountProcessing`).
- **Tests:** `matchOutcomeDispatcher.test.ts`, `deferredEndToEnd.test.ts`, `candidateRegistry.test.ts`; add clique and two-run scenarios.
- **APIs:** No connector-facing configuration or operation contract changes.
- **Performance:** Deferred drain is O(n) sequential per source; pool shrinks as anchors materialize. Identity scoring remains batched-parallel.
