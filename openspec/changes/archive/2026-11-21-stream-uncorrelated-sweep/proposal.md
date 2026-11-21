## Why

In live `1.35M`-account aggregations, `CompressedBlockMap` keeps `Fetch` at `mem=799MB / heap=301MB`, but `uncorrelated-sweep` immediately decompresses and copies all `1,348,465` accounts into `queuedAccounts: Account[]`, then builds `toScore`, `allAccounts`, `identityResults`, and `pendingDeferred` for the entire population at once — exhausting V8's `~3.6 GB` heap limit (`heap=3608.77MB`) and crashing the connector. Meanwhile, `STATUS` heartbeats remain frozen at `progress=130/130` (left over from `correlated-sweep`) because `stepStart()` does not reset progress and `runMatchSweep()` only updates progress after `scoreIdentityPhase()` returns.

## What Changes

**Uncorrelated sweep execution (`processUncorrelatedManagedAccounts` / `runMatchSweep`)**
- From: Materializes all remaining `managedAccountsById.values()` into one `queuedAccounts` array and runs a single `runMatchSweep()` call over the entire population.
- To: Streams `managedAccountsById.values()` in bounded chunks (default `4,096` accounts per chunk) into `runMatchSweep()` with a shared `{ offset, total }` progress window, allowing each chunk's decompressed `Account` objects and scoring results to be garbage-collected before the next chunk is read.
- Reason: Keeps V8 heap bounded to one chunk (~5–15 MB) instead of `3.6 GB+` on million-account runs while preserving cross-chunk Fusion account and blocking index updates.
- Impact: Non-breaking internal execution change; `MatchSweepResult` totals and `FusionService` return contract remain identical.

**Step progress reset (`LogService.stepStart`)**
- From: Updating `runContext.step` leaves `runContext.progress` carrying the previous step's `done/total` counters.
- To: `stepStart()` clears stale `runContext.progress` (and `uncorrelated-sweep` initializes `0/<total> analyzed`) before processing begins.
- Reason: Prevents `STATUS` heartbeats from reporting misleading stale counts (e.g. `130/130` from `correlated-sweep`) while a new step is running.
- Impact: Non-breaking observability fix.

## Capabilities

### New Capabilities

_(None — optimizes internal sweep streaming and step progress reporting behind existing contracts.)_

### Modified Capabilities

- `fusion-service`: Stream `managedAccountsById` in bounded chunks during `processUncorrelatedManagedAccounts()` instead of materializing all queued accounts in one array.
- `matching-service`: Support a `{ offset, total }` progress window in `runMatchSweep()` and emit pre-score progress updates so multi-chunk sweeps report accurate monotonic progress.
- `log-service`: Clear stale `runContext.progress` in `LogService.stepStart()` so a new step never inherits the previous step's progress counters.

## Impact

- **Affected code**:
  - `src/services/fusionService/fusionService.ts` (`processUncorrelatedManagedAccounts`, `runUncorrelatedManagedAccountSweep`)
  - `src/services/matchingService/matchOutcomeDispatcher.ts` (`runMatchSweep`, `MatchSweepOptions`)
  - `src/services/logService/logService.ts` (`stepStart`)
  - Unit tests under `src/services/fusionService/__tests__/`, `src/services/matchingService/__tests__/`, and `src/services/logService/__tests__/`
- **Dependencies**: None.
- **Compatibility**: Preserves `FusionService.processUncorrelatedManagedAccounts()` return type, `MatchOutcomeDispatcher.runMatchSweep()` default behavior for existing callers, and `LogService` step/status formats.
