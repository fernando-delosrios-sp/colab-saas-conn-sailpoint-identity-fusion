## Scope

Bring API-fetched managed account memory efficiency to parity with Internal Record sources across Authoritative, Orphan, and Record sources by omitting uncorrelated shadow identity references at ingest, always interning and rebuilding pruned attribute bags, streaming remaining correlated and record-unique registration sweeps in bounded chunks, and releasing fully drained compressed blocks on deletion; out of scope is changing ISC API queries, `RunStateSnapshot` serialization, or post-scoring live `FusionAccount` map architecture.

## Language

_(No new domain terms introduced; existing canonical terms **managed source account**, **referenced attribute set**, **attribute pruning**, **claimed account retention**, **managed account inventory**, **correlated account sweep**, and **uncorrelated scoring sweep** from `openspec/specs/ubiquitous-language/spec.md` apply unchanged.)_

## Decisions

- **Context**: Comparing the same `1.35M`-record dataset ingested as an Internal Record source (`.hrb` shards) versus fetched from an Identity Security Cloud (ISC) source via `/v2025/accounts` revealed a `~400–550 MB+` memory penalty on the API path across four hotspots:
  1. ISC populates `account.identityId` (and `account.identity.name`) even on uncorrelated accounts (`uncorrelated: true`), representing an uncorrelated shadow cube in ISC. `FusionRun.setManagedAccount()` indexes every truthy `account.identityId` into `managedAccountsByIdentityId` (`CompactStringSetMap`, uncompressed in V8 heap) and stores `identityId` in `managedAccountInventory` and `managedAccountsById` without checking `account.uncorrelated !== true`.
  2. `pruneManagedAccountAttributes()` returns the raw Axios `JSON.parse` `attributes` object unchanged whenever `hasUnreferenced` is `false` (`if (!hasUnreferenced) return attributes`), skipping string interning (`internValue`) and shared hidden-class shape reconstruction (`getShapeFactory`) whenever all attributes on a source are referenced.
  3. While `processUncorrelatedManagedAccounts()` streams in `4,096`-account chunks (`stream-uncorrelated-sweep`), `runCorrelatedAccountSweep()` still materializes all remaining `uncorrelated === false` accounts into a single `correlatedAccounts: Account[]` array, and `processRecordUniqueRegistration()` scans/decompresses the entire `managedAccountsById` map synchronously (even when no Record source has matching disabled) and materializes all eligible accounts into `eligible: Account[]` at once.
  4. `CompressedBlockMap.delete(key)` only frees `sealedBlocks` when the entire map drains (`compressedCount === 0`), retaining fully claimed 128-record blocks in `managedAccountsById` while uncorrelated entries remain.
- **D1 (Shadow identity stripping on uncorrelated accounts)**: In `slimManagedAccountForWorkQueue()`, `toManagedAccountInfo()`, `toRetainedAccount()`, and `FusionRun.setManagedAccount()`, ignore and omit `identityId` and `identity` when `account.uncorrelated === true`. Also omit `modified` on `SourceType.Record` accounts in `slimManagedAccountForWorkQueue()` since Record accounts are non-contributing and never participate in timestamp-based `needsRefresh` evaluation.
- **D2 (Unconditional attribute interning and shape rebuilding at bulk ingest)**: In `createAttributeBagPruner()` (`src/services/sourceService/referencedAttributeSet.ts`), always rebuild the `attributes` object through the shared hidden-class shape factory and string interner (`internValue`) even when `hasUnreferenced` is `false`, detaching from the raw Axios `JSON.parse` page object and deduplicating repeated attribute values across pages just like `createInternalRecordAccountBuilder()`.
- **D3 (Bounded chunk streaming for `processRecordUniqueRegistration` and `runCorrelatedAccountSweep`)**:
  - In `processRecordUniqueRegistration()`, short-circuit immediately without scanning `managedAccountsById` when no configured `SourceType.Record` source has matching disabled (or when no unique definitions exist). Otherwise, stream `managedAccountsById.values()` in `4,096`-account chunks (yielding to the event loop while scanning), registering unique values and claiming accounts per chunk.
  - In `runCorrelatedAccountSweep()`, stream `managedAccountsById.values()` where `account.uncorrelated === false` in bounded `4,096`-account chunks (yielding during scan) instead of materializing all correlated accounts into a single array.
- **D4 (Per-block reclamation in `CompressedBlockMap`)**: Track live record counts per sealed block (`blockLiveCounts: number[]`) in `CompressedBlockMap`. When `delete(key)` or an overwrite in `set(key, value)` reduces a sealed block's live count to `0`, replace `sealedBlocks[blockIndex]` with an empty `Buffer` and evict `blockIndex` from `lruCache` immediately.

## Open questions

- None.

## Scenarios discussed

- An API-fetched managed source account with `uncorrelated: true` and a non-empty ISC shadow `identityId` (and `identity.name`) is ingested via `fetchManagedAccounts` and `setManagedAccount`: `managedAccountsByIdentityId` must not index the shadow `identityId`, and the stored work-queue and inventory records must omit `identityId` and `identity`.
- A correlated managed source account (`uncorrelated: false` or `uncorrelated: undefined` in synthetic unit tests) with a non-empty `identityId` continues to be indexed in `managedAccountsByIdentityId` and retains `identityId` in `managedAccountInventory` and `managedAccountsById`.
- An API-fetched managed source account where every attribute key is present in `referencedAttributeSet` still has its `attributes` bag rebuilt with interned string values rather than retaining the raw `JSON.parse` object reference.
- `processRecordUniqueRegistration()` skips scanning `managedAccountsById` altogether when every configured Record source has Match enabled, and processes eligible Record accounts in bounded chunks when a Record source has `includeRecordAccountsForMatching: false`.
- `runCorrelatedAccountSweep()` processes remaining `uncorrelated === false` accounts in bounded chunks without allocating a single full-population array.
- Deleting all 128 keys belonging to one sealed block in `CompressedBlockMap` releases that block's compressed buffer and LRU cache entry immediately even while later blocks still hold live keys.
