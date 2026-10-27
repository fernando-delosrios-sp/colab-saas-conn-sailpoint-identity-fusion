## Context

Phase 3 (`refreshPhase`) iterates over existing Fusion accounts fetched from the Fusion source during Phase 2. For each account, it builds a full `FusionAccount` object, layers reviewer identities, attaches linked managed accounts from the work queue, executes Map and Normal Define passes, and registers the account in `FusionRun`.

Profiling reveals several acute memory bottlenecks during this phase:
1. `sources.fusionAccounts` calls `Array.from(this.fusionAccountsByNativeIdentity.values())`, allocating an array of 100k account references.
2. `batchProcess` calls `promiseAllBatched`, which accumulates all 100k returned `FusionAccount` instances into a `results: R[]` array that is discarded immediately after logging its count.
3. `sources.fusionAccountsByNativeIdentity` retains all raw `Account` objects until line 214 of `accountListPhases.ts`, forcing raw accounts and fully hydrated `FusionAccount` instances to coexist in memory simultaneously.
4. Every `FusionAccount` constructor runs `new Set(resolvedConfig.sources.map(sc => sc.name))`, allocating 100k identical arrays and Sets across 100k accounts.
5. `fromFusionAccount` clones `account.attributes` twice in the factory and twice more in `applyFactorySeed`.

This design addresses these multipliers through streaming execution, incremental cache depletion, and factory slimming.

## Goals / Non-Goals

**Goals:**
- Eliminate full-array allocations in `processFusionAccounts` by consuming map iterables directly.
- Free raw `Account` instances incrementally as their `FusionAccount` replacements are created.
- Avoid accumulating returned `FusionAccount` references in batch execution helpers when callers only require count or side effects.
- Share precomputed `managedSourceNames` across all `FusionAccount` instances.
- Reduce attribute dictionary cloning during `fromFusionAccount` construction.

**Non-Goals:**
- Modifying the ordering or logic of Map & Define transformations.
- Changing `FusionAccount` public accessors or method signatures.
- Depleting raw accounts when `config.recording.mode === 'record'`.

## Decisions

### D1: Iterable Batching Helper (`forEachBatched`)
- **Choice**: Introduce a generic helper in `src/services/fusionService/collections.ts`:
  ```ts
  export async function forEachBatched<T>(
      iterable: Iterable<T>,
      fn: (item: T) => Promise<void>,
      batchSize: number,
      onProgress?: (completed: number) => void
  ): Promise<number>
  ```
  It pulls items in batches of `batchSize` from the iterator, executes them with `Promise.all(batch.map(fn))`, yields to the event loop between batches, and returns the total count processed without allocating an array for all items or accumulating results.
- **Reason**: Decouples batch concurrency from array materialization, keeping heap memory flat regardless of collection size.
- **Considered alternatives**:
  - Continuing to use `promiseAllBatched`: Rejected; forces allocating full `T[]` input and `R[]` result arrays.

### D2: Incremental Raw Account Depletion
- **Choice**: In `processFusionAccount`, once the account is registered in `FusionRun` (inside `finalizeProcessedFusionAccount`), delete the raw account from `sources.fusionAccountsByNativeIdentity` unless record mode is active:
  ```ts
  if (!this.run.isRecordMode) {
      this.sources.deleteFusionAccount(account.nativeIdentity)
  }
  ```
- **Reason**: Ensures that as `FusionAccount` instances enter memory, raw `Account` objects leave memory, eliminating the 2x heap overlap.
- **Considered alternatives**:
  - Clearing the whole map at the end of the phase: Rejected; this is the current behavior causing peak memory overlap.

### D3: Static Precomputation of Managed Source Names
- **Choice**: Precompute `private static managedSourceNames: ReadonlySet<string>` inside `FusionAccount.configure(config)` and provide a static getter. Update `FusionLayers` constructor to accept or reference this shared `ReadonlySet`.
- **Reason**: Replaces 100k identical array and Set allocations with a single shared instance for the lifetime of the aggregation run.
- **Considered alternatives**:
  - Lazily calculating the Set per account: Rejected; still allocates per account.

### D4: Single-Pass Factory Seeding
- **Choice**: In `fromFusionAccount`, pass `account.attributes` directly into `applyFactorySeed`. `applyFactorySeed` calls `omitNullishAttributeKeys` once to produce `attributeBag.current`. For `attributeBag.previous`, assign `attributeBag.current` (or an empty frozen object) and only clone a distinct dictionary when a configured Velocity template contains `$previous`.
- **Reason**: Eliminates 3 redundant shallow clones per refreshed account (saving 300k dictionary allocations on a 100k run).
- **Considered alternatives**:
  - Retaining unconditional cloning: Rejected; wastes memory when `$previous` is rarely referenced.

## Risks / Trade-offs

- [Risk] Deleting from `fusionAccountsByNativeIdentity` during iteration causes iterator invalidation.
  -> Mitigation: In JavaScript V8, `Map.prototype.delete(key)` is guaranteed safe during `Map.prototype.values()` iteration; already-visited keys that are deleted do not disrupt the iteration sequence of remaining keys.
- [Risk] Record mode tests fail because raw accounts were cleared early.
  -> Mitigation: `deleteFusionAccount` is guarded by `!this.run.isRecordMode`.

## Migration Plan

N/A — Purely internal memory and GC optimization.

## Open Questions

None.
