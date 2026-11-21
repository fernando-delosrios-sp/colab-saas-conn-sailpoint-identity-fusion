## Why

Live aggregations of massive tenants (`1,348,596` managed source accounts) exhaust SailPoint SaaS Connectivity container RAM (`mem=4298.82MB heap=2427.96MB`), causing 15–20+ second OS memory-reclaim / event-loop stalls and `command expired` failures near the end of `Fetch`. Because the container filesystem is `memfs` (RAM-backed), spilling to `/tmp` still consumes container RSS. Uncompressed off-heap `Buffer` slabs (`CompactManagedAccountMap`) move bytes out of `heapUsed` but still keep `~712 MB` of uncompressed JSON in RSS, while `managedAccountInventory` (~350 MB), `managedAccountsByIdentityId` (~280 MB), `fusionAccountsByNativeIdentity`, and `identityMap` continue to hold millions of uncompressed JS objects and duplicated composite key prefixes (`<sourceId>::`) in V8 heap.

## What Changes

- Replace uncompressed off-heap `Buffer` slabs with a reusable **compressed in-memory block store** (`CompressedBlockMap<V>`) using raw DEFLATE (`zlib.deflateRawSync`, level 1) over fixed-size record blocks (128 records/block) with a bounded LRU cache of decompressed blocks (16 blocks) and a configurable in-heap threshold (`inHeapLimit = 10_000`) so small runs and unit tests keep direct JS object identity.
- Add **source-partitioned key indexing** (Option 4) to `CompressedBlockMap` for composite managed-account keys (`<sourceId>::<nativeIdentity>`), storing keys as `Map<sourceId, Map<nativeIdentity, slot>>` internally so the 34-byte `<sourceId>::` prefix is not duplicated across millions of key strings.
- Back `FusionRun.managedAccountsById`, `FusionRun.claimedAccountRetention`, `FusionRun.managedAccountInventory`, `FusionRun.identityMap`, and `SourceService.fusionAccountsByNativeIdentity` with `CompressedBlockMap` so all fetched account and identity populations benefit from ~10–12x payload compression in RSS.
- Compact `FusionRun.managedAccountsByIdentityId` internally so single-account identities do not allocate a dedicated `Set<string>` object during bulk ingest, while preserving `getKeysForIdentity(identityId)` and `Map<string, Set<string>>` compatibility for existing callers and tests.
- Remove the superseded uncompressed `CompactManagedAccountMap` once replaced by `CompressedBlockMap`.

## Capabilities

### New Capabilities

_(None — this change optimizes internal storage behind existing `FusionRun`, `SourceService`, and `IdentityService` contracts.)_

### Modified Capabilities

- `fusion-run`: Require `FusionRun` fetched-account and identity stores (`managedAccountsById`, `claimedAccountRetention`, `managedAccountInventory`, `identityMap`) to use compressed in-memory block storage with source-partitioned composite key indexing above the in-heap threshold, and require compact single-entry storage for `managedAccountsByIdentityId` without changing external `Map` or snapshot/restore contracts.
- `source-service`: Require `SourceService.fusionAccountsByNativeIdentity` to use compressed in-memory block storage above the in-heap threshold and release all compressed blocks on `clearFusionAccounts()`.

## Impact

- **Affected code**:
  - `src/model/compactManagedAccountMap.ts` (replaced by `src/model/compressedBlockMap.ts`)
  - `src/model/fusionRun.ts` (`managedAccountsById`, `claimedAccountRetention`, `managedAccountInventory`, `managedAccountsByIdentityId`, `identityMapValue`)
  - `src/services/sourceService/sourceService.ts` (`fusionAccountsByNativeIdentity`)
  - Unit tests under `src/model/__tests__/` and `src/services/sourceService/__tests__/`
- **Dependencies**: Node.js built-in `node:zlib` only (zero new npm packages).
- **Compatibility**: External `Map` contracts (`instanceof Map`, `.get/.set/.has/.delete/.clear/.size/.keys/.values/.entries/forEach`), `FusionRun.snapshot()`/`restore()`, and `CHANGELOG.md` remain backward-compatible.
