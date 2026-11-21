## Context

When comparing the same `1.35M`-account population loaded as an Internal Record source (`.hrb` shards) versus fetched from an ISC source via `/v2025/accounts`, the API-fetched path consumes `~400–550 MB+` more memory across Authoritative, Orphan, and Record sources:

1. **Shadow `identityId` on uncorrelated ISC accounts**: ISC `/v2025/accounts` populates `account.identityId` and `account.identity` even on uncorrelated accounts (`uncorrelated: true`), pointing to an uncorrelated shadow cube in ISC. `internalRecordAccount()` sets `identityId: undefined`, leaving `FusionRun.managedAccountsByIdentityId` empty (`0 MB`). On the API path, `FusionRun.setManagedAccount()` checks `if (account.identityId)` without checking `account.uncorrelated !== true`, inserting all `1.35M` uncorrelated accounts into `managedAccountsByIdentityId` (`CompactStringSetMap`, holding `1.35M` 32-byte UUID keys and `1.35M` full `<sourceId>::<nativeIdentity>` strings in uncompressed V8 heap: `~250–350 MB`). Because shadow cube IDs never match an in-scope identity during `Refresh` or `processIdentities`, those entries remain in V8 heap until `Output`.
2. **High-entropy UUIDs and timestamps in compressed blocks**: Retaining shadow `identityId` and `identity.name` on uncorrelated accounts (and `modified` on non-contributing `SourceType.Record` accounts) adds uncompressible random hex UUIDs to every record in `managedAccountsById` and `managedAccountInventory`, inflating `CompressedBlockMap` buffers by 2–3x (`~120–180 MB` extra RSS).
3. **`pruneManagedAccountAttributes()` early return when all attributes are referenced**: `createAttributeBagPruner()` returns the raw Axios `JSON.parse` `attributes` object directly when `hasUnreferenced` is `false` (`if (!hasUnreferenced) return attributes`), bypassing `internValue()` and `getShapeFactory()` whenever a source has no unreferenced attributes.
4. **Unchunked `processRecordUniqueRegistration` and `runCorrelatedAccountSweep` + coarse block reclamation**:
   - `processRecordUniqueRegistration()` synchronously iterates and decompresses all `1.35M` entries in `managedAccountsById` even when every Record source has matching enabled, and materializes all eligible accounts into `eligible: Account[]` at once when a Record source has `includeRecordAccountsForMatching: false`.
   - `runCorrelatedAccountSweep()` materializes all remaining `uncorrelated === false` accounts into `correlatedAccounts: Account[]` at once.
   - `CompressedBlockMap.delete(key)` only frees `sealedBlocks` when `compressedCount === 0`, holding onto fully claimed 128-record blocks while any other entry remains in the map.

## Goals / Non-Goals

**Goals:**
- Omit `identityId` and `identity` on explicitly uncorrelated accounts (`account.uncorrelated === true`) across `slimManagedAccountForWorkQueue`, `toManagedAccountInfo`, `toRetainedAccount`, and `FusionRun.setManagedAccount`, and omit `modified` on `SourceType.Record` accounts during bulk ingest.
- Always intern short string values and rebuild `account.attributes` via the shared hidden-class shape factory in `pruneManagedAccountAttributes()`, even when `hasUnreferenced` is `false`.
- Short-circuit `processRecordUniqueRegistration()` without scanning `managedAccountsById` when no Record source has matching disabled, and stream both `processRecordUniqueRegistration()` and `runCorrelatedAccountSweep()` in bounded `4,096`-account chunks.
- Reclaim individual sealed blocks in `CompressedBlockMap` as soon as all slots in a block have been deleted or overwritten.

**Non-Goals:**
- Changing ISC API query filters, pagination concurrency, or `RunStateSnapshot` schema.
- Changing post-scoring `FusionAccount` storage in `fusionAccountMap` / `fusionIdentityMap`.

## Decisions

### D1: Strip shadow `identityId` / `identity` when `account.uncorrelated === true` and omit `modified` on Record sources
- **Choice**:
  - In `slimManagedAccountForWorkQueue(account, source)` (`src/services/sourceService/managedAccountFetcher.ts`), only copy `identityId` and `identity: { name }` when `account.uncorrelated !== true`, and only copy `modified` when `source.sourceType !== SourceType.Record`.
  - In `toManagedAccountInfo(account)`, `toRetainedAccount(account)`, and `FusionRun.setManagedAccount(accountKey, account)` (`src/model/fusionRun.ts`), treat `effectiveIdentityId = account.uncorrelated === true ? undefined : account.identityId` so uncorrelated accounts never populate `managedAccountsByIdentityId` or store shadow `identityId`s in `managedAccountInventory` or `claimedAccountRetention`.
- **Reason**: An account with `uncorrelated: true` is uncorrelated in ISC; its `identityId` is an ISC shadow cube, never a correlated identity. Checking `account.uncorrelated !== true` preserves full compatibility with both correlated ISC accounts (`uncorrelated: false`) and synthetic unit-test fixtures that omit `uncorrelated` (`uncorrelated: undefined`).
- **Considered alternatives**:
  - Requiring `account.uncorrelated === false` in `setManagedAccount` — would break unit tests that construct synthetic correlated accounts with `{ identityId: 'id-1' }` without explicitly setting `uncorrelated: false`.

### D2: Always rebuild and intern `attributes` in `pruneManagedAccountAttributes()`
- **Choice**: Remove `if (!hasUnreferenced) return attributes` in `createAttributeBagPruner()` (`src/services/sourceService/referencedAttributeSet.ts`) so that every non-empty `attributes` bag is rebuilt through `getShapeFactory(keptKeys)` (or the fallback object) with `internValue(key, attributes[key])`.
- **Reason**: Deduplicates repeated string values (departments, titles, booleans-as-strings, locations, etc.) up to `4,096` distinct values per key and detaches the attribute bag from the raw Axios `JSON.parse` object graph even when 100% of the source's attributes are referenced.
- **Considered alternatives**:
  - Keeping the early return and only interning in-place — mutating the raw `JSON.parse` object in-place retains its V8 hidden class and parent slice references from the full unpruned HTTP response.

### D3: Short-circuit and chunk `processRecordUniqueRegistration()` and chunk `runCorrelatedAccountSweep()`
- **Choice**:
  - In `FusionService.processRecordUniqueRegistration()`:
    1. Check upfront whether at least one source in `this.run.sourcesByName.values()` has `sourceType === SourceType.Record` and `!isRecordMatchingEnabledForSource(source.name, this.run.sourcesByName)`. If not, return `{ registered: 0 }` immediately without iterating `this.run.managedAccountsById`. (Match-disabled Record accounts must still be claimed from `managedAccountsById` even when no unique definitions exist so they are not scored in the uncorrelated sweep.)
    2. When eligible Record sources exist, iterate `this.run.managedAccountsById.values()` in bounded chunks of `UNCORRELATED_SWEEP_CHUNK_SIZE` (`4,096`), yielding every `getManagedAccountEventLoopYieldEvery(this.config)` accounts examined. For each chunk of `4,096` eligible accounts, call `registerUniqueValuesFromRecordManagedAccounts()` and `claimAccount()` for each account in the chunk before advancing to the next chunk.
  - In `FusionService.runCorrelatedAccountSweep()`:
    1. Iterate `map.values()` (yielding periodically) and collect `account.uncorrelated === false` accounts into bounded chunks of `UNCORRELATED_SWEEP_CHUNK_SIZE` (`4,096`).
    2. Process each chunk via `batchProcess()` before collecting the next chunk, accumulating `totalCorrelated` and `droppedLinked` across chunks and emitting the start detail on the first non-empty chunk.
- **Reason**: Eliminates the redundant `1.35M`-account decompression scan when Record sources have Match enabled, and bounds V8 heap to at most `4,096` decompressed `Account` objects during both sweeps.
- **Considered alternatives**:
  - Two-pass count-then-stream in `processRecordUniqueRegistration` — would decompress the entire `1.35M`-account map twice.

### D4: Per-block live slot tracking and reclamation in `CompressedBlockMap`
- **Choice**: Maintain `private blockLiveCounts: number[] = []` in `CompressedBlockMap<V>`.
  - When a record is appended to `pending` at `slot = blockIndex * blockSize + recordIndex`, increment `blockLiveCounts[blockIndex]`.
  - When `deleteSlot(key)` removes an existing slot (or `set(key, value)` overwrites an existing compressed slot), decrement `blockLiveCounts[oldBlockIndex]`.
  - If `oldBlockIndex < this.sealedBlocks.length` and `this.blockLiveCounts[oldBlockIndex] === 0`, replace `this.sealedBlocks[oldBlockIndex] = Buffer.alloc(0)` and delete `oldBlockIndex` from `this.lruCache`.
- **Reason**: Keeps `slot` indexing (`blockIndex * blockSize + recordIndex`) O(1) without renumbering slots while freeing each sealed `Buffer` slab and its cached decompressed array as soon as all 128 records in that block are claimed or deleted.
- **Considered alternatives**:
  - Compacting/shifting `sealedBlocks` array indices — would invalidate all existing slot numbers in `flatIndex` and `partitions`.

## Risks / Trade-offs

- [Risk] Deleting or claiming keys during `for (const account of map.values())` in chunked `processRecordUniqueRegistration` or `runCorrelatedAccountSweep` -> Mitigation: Only keys already yielded into the current chunk are claimed via `claimAccount()` before advancing the iterator to the next chunk; JS `Map` and `CompressedBlockMap` iterators safely tolerate deletion of already-visited keys, and releasing a drained block only clears `sealedBlocks[oldBlockIndex]` for an already-iterated block.
- [Trade-off] In chunked `processRecordUniqueRegistration`, total eligible Record accounts is not known upfront without a full pre-scan -> Reason for acceptance: Using `map.size` (or cumulative registered count) for progress avoids decompressing `1.35M` accounts twice while keeping V8 heap bounded to `4,096` accounts.

## Migration Plan

N/A — Purely internal memory and streaming optimization with no configuration or schema changes.

## Open Questions

- None.
