## Context

After compressing fetched account and identity stores with `CompressedBlockMap`, `Fetch` on a `1,348,596`-account tenant completes at `mem=799.18MB / heap=301.29MB`. However, `uncorrelated-sweep` immediately OOMs at `heap=3608.77MB`:

1. `FusionService.processUncorrelatedManagedAccounts()` iterates `this.run.managedAccountsById.values()` and pushes all `1,348,465` decompressed `Account` objects into `queuedAccounts: Account[]`.
2. `MatchOutcomeDispatcher.runMatchSweep(queuedAccounts, batchSize)` iterates all `1.35M` accounts to build `toScore: PendingScore[]` and `allAccounts: Account[]`, then calls `scoreIdentityPhase(allAccounts, batchSize, ...)` which scores all `1.35M` accounts and holds `identityResults` and `pendingDeferred` for the entire population simultaneously in V8 heap.
3. `LogService.stepStart()` sets `runContext.step` without clearing `runContext.progress`, so the heartbeat displays `correlated-sweep`'s `130/130` during the 7.4s `queuedAccounts` copy and throughout `scoreIdentityPhase()` until OOM.

## Goals / Non-Goals

**Goals:**
- Keep V8 heap flat during `uncorrelated-sweep` on `1M+` account runs by streaming `managedAccountsById.values()` in bounded chunks (default `4,096` accounts).
- Preserve exact match semantics: within each chunk, exact matches and new Fusion accounts are dispatched and indexed before that chunk's `runDeferredDrain()` runs, so subsequent chunks see all previously created Fusion accounts in `blockingIndexes` and `linkedAccountKeyIndex`.
- Clear stale `runContext.progress` in `LogService.stepStart()` and report accurate `0/<total> analyzed` → `<total>/<total> analyzed` progress across chunks.

**Non-Goals:**
- Changing match scoring rules, threshold logic, or `CompressedBlockMap` block size.
- Changing ISC API calls or `RunStateSnapshot` format.

## Decisions

### D1: Stream `managedAccountsById.values()` in bounded chunks (`4,096` accounts)
- **Choice**: In `FusionService.processUncorrelatedManagedAccounts()`, instead of collecting all entries into `queuedAccounts`, read `this.run.managedAccountsById.values()` in chunks of `UNCORRELATED_SWEEP_CHUNK_SIZE = 4_096` (yielding to the event loop via `createLoopYielder` while filling each chunk), and pass each chunk to `this.dispatcher.runMatchSweep(chunk, batchSize, { progressOffset, progressTotal })`. Accumulate `processed` across chunks.
- **Reason**: At `4,096` accounts per chunk, only ~4,096 decompressed `Account` objects, `toScore` wrappers, and `ScoredAccount` results exist in V8 heap at any time (~5–15 MB), and each chunk completes in ~100–300ms so GC reclaims it before the next chunk is decompressed from `CompressedBlockMap`. Because `runMatchSweep` dispatches exact matches and drains deferred matches per chunk, `blockingIndexes` and `FusionRun` state stay up-to-date for subsequent chunks.
- **Considered alternatives**:
  - Increasing Node `--max-old-space-size` — container RAM is fixed at 4 GB; `3.6 GB` heap + off-heap RSS already exceeds container limits.
  - Buffering `scoreIdentityPhase` inside `runMatchSweep` only — `processUncorrelatedManagedAccounts()` would still hold all `1.35M` decompressed `Account` objects in `queuedAccounts`.

### D2: Optional `progressOffset` / `progressTotal` in `MatchSweepOptions`
- **Choice**: Extend `MatchSweepOptions` with optional `progressOffset?: number` (default `0`) and `progressTotal?: number` (default `accounts.length`). Initialize `log.setProgress(progressOffset, progressTotal, 'analyzed')` at the start of `runMatchSweep` and report `progressOffset + processedCount` on `updateProgress()`. Also call `updateProgress()` periodically during the pre-score loop (not only on `skip-linked` / `non-match`) or when each chunk finishes.
- **Reason**: Keeps existing `runMatchSweep(accounts, batchSize)` callers and tests unchanged while giving multi-chunk `uncorrelated-sweep` accurate `0/1348465` → `1348465/1348465` progress.

### D3: Clear stale `runContext.progress` in `LogService.stepStart()`
- **Choice**: In `LogService.stepStart()`, reset `this.runContext.progress = undefined` before logging `STEP <step> START` (and clear it in `stepEnd()` as well).
- **Reason**: Prevents any step from inheriting the previous step's `done/total` progress in `STATUS` heartbeats if the new step has a setup/iteration phase before its first `setProgress()` call.
- **Considered alternatives**:
  - Only resetting in `processUncorrelatedManagedAccounts()` — leaves the same bug for any other step boundary.

## Risks / Trade-offs

- [Trade-off] `runDeferredDrain` runs per `4,096`-account chunk rather than once globally at the end of `1.35M` accounts -> Reason for acceptance: `runDeferredDrain` only compares deferred accounts against `blockingIndexes` (which already contains all existing + newly created Fusion accounts from prior chunks) and same-chunk deferred peers, and in `1.35M` runs deferred accounts are processed in deterministic source-partitioned iteration order.
- [Risk] `managedAccountsById` is mutated (`claimAccount` deletes entries) while `managedAccountsById.values()` is being iterated -> Note: JavaScript `Map` (and `CompressedBlockMap`) iterators safely tolerate deletion of the *already-yielded* key during iteration; `claimAccount` only deletes keys already yielded into the current chunk.

## Migration Plan

N/A — Internal execution and logging fix with no configuration or API changes.

## Open Questions

- None.
