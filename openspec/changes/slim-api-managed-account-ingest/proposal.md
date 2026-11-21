## Why

Comparing the exact same `1.35M`-account dataset ingested as an Internal Record source (`.hrb` shards) versus fetched from an Identity Security Cloud (ISC) source via `/v2025/accounts` revealed a `~400–550 MB+` memory penalty on the API path across Authoritative, Orphan, and Record sources. In ISC, `/v2025/accounts` populates `account.identityId` (and `account.identity.name`) even on uncorrelated accounts (`uncorrelated: true`), representing an uncorrelated shadow identity cube. Because `FusionRun.setManagedAccount()` and `slimManagedAccountForWorkQueue()` retain `identityId` without checking `account.uncorrelated !== true`, all `1.35M` uncorrelated API accounts are indexed into `managedAccountsByIdentityId` (`~250–350 MB` uncompressed V8 heap) and carry uncompressible UUIDs in `CompressedBlockMap`. In addition, `pruneManagedAccountAttributes()` skips string interning when all source attributes are referenced, `runCorrelatedAccountSweep()` and `processRecordUniqueRegistration()` still materialize full-population arrays, and `CompressedBlockMap.delete()` only frees blocks when the entire map is empty.

## What Changes

**Shadow identity stripping on uncorrelated managed accounts (`managedAccountFetcher` / `FusionRun`)**
- From: Retains `account.identityId` and `account.identity` on slimmed work-queue entries, `managedAccountInventory`, `claimedAccountRetention`, and indexes `account.identityId` in `managedAccountsByIdentityId` even when `account.uncorrelated === true`, and retains `modified` on `SourceType.Record` accounts.
- To: Omits `identityId` and `identity` when `account.uncorrelated === true` in `slimManagedAccountForWorkQueue()`, `toManagedAccountInfo()`, `toRetainedAccount()`, and `FusionRun.setManagedAccount()`, and omits `modified` on `SourceType.Record` accounts in `slimManagedAccountForWorkQueue()`.
- Reason: Eliminates `~250–350 MB` of uncompressed V8 heap in `managedAccountsByIdentityId` and removes uncompressible random UUIDs and timestamps from compressed blocks on `1M+` uncorrelated API account runs.
- Impact: Non-breaking internal optimization across Authoritative, Orphan, and Record API sources.

**Unconditional attribute interning and shared-shape rebuilding (`pruneManagedAccountAttributes`)**
- From: Returns the raw `JSON.parse` `attributes` object untouched when `hasUnreferenced` is `false`.
- To: Always rebuilds `attributes` through the compiled hidden-class shape factory (`getShapeFactory`) and short-string interner (`internValue`) even when all keys on the account are in `referencedAttributeSet`.
- Reason: Ensures API-fetched accounts whose attributes are all referenced still deduplicate repeated string values and release the raw Axios `JSON.parse` page object graph immediately, matching `createInternalRecordAccountBuilder()`.
- Impact: Non-breaking internal memory optimization.

**Bounded chunk streaming for `processRecordUniqueRegistration` and `runCorrelatedAccountSweep` (`FusionService`)**
- From: `processRecordUniqueRegistration()` scans and decompresses all entries in `managedAccountsById` synchronously (even when no Record source has matching disabled) and pushes all eligible accounts into a single `eligible: Account[]` array; `runCorrelatedAccountSweep()` pushes all remaining `uncorrelated === false` accounts into a single `correlatedAccounts: Account[]` array.
- To: `processRecordUniqueRegistration()` short-circuits immediately when no configured Record source has matching disabled and otherwise streams `managedAccountsById.values()` in bounded `4,096`-account chunks; `runCorrelatedAccountSweep()` streams `uncorrelated === false` accounts in bounded `4,096`-account chunks.
- Reason: Prevents multi-gigabyte V8 heap spikes when a large Record source disables Match or when a large API source has many orphan correlated accounts, and avoids a redundant `1.35M`-account decompression pass when all Record sources have Match enabled.
- Impact: Non-breaking internal execution change.

**Per-block memory reclamation on deletion (`CompressedBlockMap`)**
- From: Releases `sealedBlocks` only when `compressedCount === 0` (when the entire map is empty).
- To: Tracks remaining live slots per sealed block (`blockLiveCounts`) and immediately releases `sealedBlocks[blockIndex]` (and evicts `blockIndex` from `lruCache`) when a block's live slot count reaches `0`.
- Reason: Reclaims compressed block buffers progressively as accounts are claimed during `Refresh`, `processIdentities`, `correlated-sweep`, and `record-unique-registration` even while uncorrelated accounts remain in the queue.
- Impact: Non-breaking internal storage improvement.

## Capabilities

### New Capabilities

_(None — optimizes internal ingest, storage, and sweep streaming behind existing contracts.)_

### Modified Capabilities

- `fusion-run`: Require `setManagedAccount`, `toManagedAccountInfo`, and `toRetainedAccount` to omit `identityId` and skip `managedAccountsByIdentityId` indexing when `account.uncorrelated === true`, and require `CompressedBlockMap` to release individual sealed blocks as soon as all slots in a block are deleted or overwritten.
- `source-service`: Require bulk managed-account ingest (`slimManagedAccountForWorkQueue` and `pruneManagedAccountAttributes`) to omit `identityId`/`identity` when `account.uncorrelated === true`, omit `modified` on `SourceType.Record` accounts, and always rebuild and intern `attributes` even when all keys are in `referencedAttributeSet`.
- `fusion-service`: Require `processRecordUniqueRegistration()` to short-circuit without scanning `managedAccountsById` when no Record source has matching disabled and to stream eligible accounts in bounded chunks otherwise, and require `processCorrelatedManagedAccounts()` (`runCorrelatedAccountSweep`) to stream correlated accounts in bounded chunks.

## Impact

- **Affected code**:
  - `src/model/compressedBlockMap.ts`
  - `src/model/fusionRun.ts`
  - `src/services/sourceService/managedAccountFetcher.ts`
  - `src/services/sourceService/referencedAttributeSet.ts`
  - `src/services/fusionService/fusionService.ts`
  - Unit tests under `src/model/__tests__/`, `src/services/sourceService/__tests__/`, and `src/services/fusionService/__tests__/`
- **Dependencies**: None.
- **Compatibility**: External `Map` contracts, `FusionRun` public methods, and ISC operation outputs remain backward-compatible.
