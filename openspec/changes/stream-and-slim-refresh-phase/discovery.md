## Scope

Optimize Phase 3 (Refresh) memory consumption by streaming fusion account processing directly from map iterables without allocating intermediate arrays, deleting raw fusion accounts as each instance finishes, precomputing shared static source sets, and eliminating redundant attribute bag clones during factory seeding.

## Language

**Iterable Batching** (`promote`):
Processing collections in bounded batches directly from an `Iterable<T>` (such as `Map.prototype.values()`) without first converting them into an intermediate `T[]` array or accumulating an `R[]` result array.
_Avoid_: array slicing, full-collection materialization.

**Raw Account Depletion** (`promote`):
Deleting raw `Account` instances from the source fetch cache (`sources.fusionAccountsByNativeIdentity`) immediately upon completing the construction of each `FusionAccount`, preventing raw and hydrated representations from coexisting in the heap.
_Avoid_: bulk cache flushing, post-phase cache purge.

## Decisions

- **Context**: During Phase 3 (Refresh), the connector processes refreshed Fusion accounts by allocating a 100k array from `fusionAccountsByNativeIdentity.values()`, accumulating another 100k result array in `batchProcess`, retaining all raw `Account` objects until the phase ends, and cloning attribute bags 4x per account.
- **Q1**: How should Phase 3 batch processing consume items?
  - *Chosen*: Introduce an iterable-based `forEachBatched(iterable, fn, batchSize)` helper that yields batches from an iterator and tracks completion count without allocating `T[]` or accumulating `R[]`.
- **Q2**: When should raw fusion accounts be freed?
  - *Chosen*: Delete each raw `Account` from `sources.fusionAccountsByNativeIdentity` inside `processFusionAccount` as soon as its `FusionAccount` is registered in `FusionRun`.
- **Q3**: How can per-account factory allocation churn be reduced?
  - *Chosen*: Precompute `managedSourceNames: ReadonlySet<string>` statically in `FusionAccount.configure(config)` to share across all instances, and eliminate redundant `omitNullishAttributeKeys` passes in `applyFactorySeed`.

## Open questions

None.

## Scenarios discussed

- Large tenant with 100k existing Fusion accounts: Raw accounts are deleted entry-by-entry as they are converted; no duplicate heap spike occurs during Phase 3.
- Heartbeat and metrics logging: `forEachBatched` tracks progress and emits accurate heartbeat metrics without returning a bloated 100k `results[]` array.
- Record mode: When record mode is enabled (`config.recording.mode === 'record'`), raw account depletion is bypassed to preserve recording snapshots.
- Attribute mapping and definitions: `attributeBag.current` is seeded once without redundant clones; `attributeBag.previous` is shared or lazily copied only when `$previous` Velocity references exist.
