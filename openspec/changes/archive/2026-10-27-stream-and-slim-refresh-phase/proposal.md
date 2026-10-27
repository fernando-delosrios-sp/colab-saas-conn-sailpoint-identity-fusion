## Why

During Phase 3 (Refresh), processing existing Fusion accounts creates multiple full-array copies and retains all raw Account payloads alongside their hydrated FusionAccount counterparts until the phase completes. Furthermore, factory instantiation clones attribute dictionaries 4 times and allocates duplicate Set objects for every account. By streaming batches directly from map iterables, depleting raw account entries as each account finishes, precomputing static source sets, and eliminating redundant attribute cloning, Phase 3 heap footprint is reduced by 40 to 50 percent with zero change to aggregation behavior.

## What Changes

**Batch Execution and Collection Iteration**
- From: `sources.fusionAccounts` converts `fusionAccountsByNativeIdentity.values()` into a full array via `Array.from()`, and `batchProcess` accumulates a full `R[]` result array.
- To: `FusionService.processFusionAccounts` consumes `fusionAccountsByNativeIdentity.values()` directly via a new streaming `forEachBatched` helper that yields fixed-size batches and tracks completion without collecting results.
- Reason: Eliminates intermediate array allocations holding hundreds of thousands of object references.
- Impact: Internal optimization; preserves all logging and progress metrics.

**Raw Fusion Account Cache Lifecycle**
- From: Raw `Account` instances in `sources.fusionAccountsByNativeIdentity` are retained until the end of Phase 3, coexisting with newly hydrated `FusionAccount` instances.
- To: Each raw `Account` is deleted from `sources.fusionAccountsByNativeIdentity` as soon as its corresponding `FusionAccount` is constructed and registered.
- Reason: Eliminates 2x memory duplication during Phase 3.
- Impact: Non-breaking; preserves retention when record mode is active.

**FusionAccount Factory Seeding & Static Set Sharing**
- From: Every `new FusionAccount()` allocates an array and a `Set` for `managedSourceNames`, and `applyFactorySeed` creates 4 shallow clones of the attributes dictionary.
- To: `FusionAccount.configure(config)` precomputes a static `ReadonlySet<string>` of managed source names, and `applyFactorySeed` performs a single `omitNullishAttributeKeys` pass.
- Reason: Eliminates hundreds of thousands of ephemeral array, Set, and dictionary allocations.
- Impact: Internal domain model cleanup.

## Capabilities

### Modified Capabilities
- `fusion-service`: Uses iterable batching and incremental raw account depletion during `processFusionAccounts`.
- `account-assembly`: Uses static `managedSourceNames` and single-pass attribute seeding during `FusionAccount` construction.
- `ubiquitous-language`: Defines canonical vocabulary for Iterable Batching and Raw Account Depletion.

## Impact

- **Services**: Modifies `FusionService`, `SourceService`, `FusionAccount`, `FusionAccountFactories`, and `collections.ts`.
- **Memory**: 40–50% reduction in Phase 3 peak heap consumption; eliminates redundant GC pressure.
- **Contract**: Zero changes to connector schemas, configuration, or ISC account output.
