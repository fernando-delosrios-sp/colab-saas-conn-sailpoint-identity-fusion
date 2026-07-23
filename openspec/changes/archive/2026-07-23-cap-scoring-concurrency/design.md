## Context

Identity Fusion's Match step scores uncorrelated managed accounts against identity and deferred candidate pools. `scoreManagedAccounts` in `matchOutcomeDispatcher.ts` processes accounts in outer batches sized by `managedAccountsBatchSize` (default 100). Within each batch, identity scoring and deferred scoring currently launch all work concurrently via `Promise.all`.

Fusion output and identity refresh paths already use `getFusionParallelBatchSize`, which caps concurrent promises at `min(managedAccountsBatchSize, 12)`. Scoring lacks an equivalent cap, creating a resource asymmetry: up to 100 in-flight scoring contexts vs 12 elsewhere.

Scoring work is CPU-bound synchronous comparison on Node's main thread, with periodic `setImmediate` yields inside `scoreFusionAccount`. More concurrent scoring tasks increase live object count (assembled accounts, score reports, normalized strings) without proportional speedup.

## Goals / Non-Goals

**Goals:**
- Cap concurrent identity-comparison scoring operations with default 12
- Expose `scoringMaxConcurrency` as an independent developer setting
- Reuse existing `promiseAllBatched` utility for both identity and deferred scoring loops
- Preserve batch grouping semantics (`managedAccountsBatchSize` unchanged)

**Non-Goals:**
- Optimizing per-comparison allocation (advisor plan 002)
- Worker-thread parallelism
- Changing fusion parallel batch size (`getFusionParallelBatchSize`)
- Benchmarking or auto-tuning concurrency

## Decisions

### D1: Dedicated config knob vs reusing fusion parallel batch size

- **Choice:** New `scoringMaxConcurrency` setting with `getScoringMaxConcurrency()` helper
- **Reason:** Decouples scoring throughput from fusion account output batching; same default (12) but independently tunable
- **Considered alternatives:** Reuse `getFusionParallelBatchSize` directly — rejected because it hides scoring-specific tuning behind fusion semantics

### D2: Batching implementation

- **Choice:** `promiseAllBatched(items, fn, scoringConcurrency)` in both scoring loops
- **Reason:** Already documented for bounding concurrent promises; yields between waves via `yieldToEventLoop`
- **Considered alternatives:** Custom semaphore/p-limit — rejected (no new dependencies; utility exists)

### D3: Effective concurrency resolution

- **Choice:** `Math.max(1, Math.min(batchSize, getScoringMaxConcurrency(config)))`
- **Reason:** Never exceed current batch slice; never below 1; config clamped to 50 at helper level
- **Considered alternatives:** Always use config value ignoring batchSize — rejected (can't run more concurrent tasks than items in batch)

### D4: Fallback when unset

- **Choice:** Default and fallback to 12, never to uncapped `batchSize`
- **Reason:** Explicit opt-in required to raise concurrency; prevents accidental 100-wide scoring on missing config

## Risks / Trade-offs

- [Risk] Operators expecting faster runs by raising batch size alone see no scoring speedup → Mitigation: Document that `managedAccountsBatchSize` groups work; `scoringMaxConcurrency` controls parallel scoring
- [Risk] Wall-clock time increases if future scoring moves to true parallelism → Mitigation: Config allows raising cap up to 50; revisit after plan 002 benchmarks
- [Trade-off] Two related knobs (batch size vs concurrency) → Accepted: clearer separation of grouping vs throughput

## Migration Plan

N/A — connector setting addition with safe defaults. Deploy via normal connector bundle update. No data migration.

**Rollout:** Ship with default 12. Monitor aggregation duration and memory in existing environments.

**Rollback:** Revert code or set `scoringMaxConcurrency` higher in developer settings (up to 50).

## Open Questions

- None blocking implementation. Post-ship: benchmark wall-clock vs memory at 12 vs 100 to validate advisor plan 002 baseline.
