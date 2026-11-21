## Context

During `std:account:list` on massive tenants (`~1.35M` managed source accounts plus Fusion accounts and identities), SailPoint SaaS Connectivity containers hit memory pressure (`mem=4298.82MB heap=2427.96MB`) near the end of `Fetch`, stalling the event loop for 15–20+ seconds and expiring the command.

Benchmarks on Node 24 for `1,348,596` accounts established:
- Current uncompressed 4 MiB `Buffer` slabs (`CompactManagedAccountMap`) + `managedAccountInventory` + `managedAccountsByIdentityId`: **1,624 MB RSS** (`850 MB` V8 heap + `712 MB` uncompressed `ArrayBuffer`), before counting `fusionAccounts` or `identities`.
- Raw DEFLATE (`zlib.deflateRawSync`, level 1) over 256-record JSON blocks: **58.6 MB** compressed payload (**12:1** ratio) in **2.6s** total, cutting RSS to **535 MB** (`220 MB` V8 heap + `59 MB` off-heap).
- Container `/tmp` in SailPoint SaaS Connectivity is `memfs` (RAM-backed), so disk spilling provides zero RSS relief.

## Goals / Non-Goals

**Goals:**
- Consistently reduce container RSS for fetched managed accounts, claimed retention, inventory metadata, Fusion accounts, and identities by 3–5x on massive runs (`1M+` records).
- Eliminate duplicated `<sourceId>::` key prefixes across millions of composite managed-account keys (Option 4).
- Eliminate per-identity `Set<string>` allocations for single-account identities in `managedAccountsByIdentityId`.
- Preserve 100% `Map<string, V>` compatibility (`instanceof Map`, iteration, mutation, `clear()`) and exact object identity for small runs and unit tests (`<= inHeapLimit`).
- Release all compressed blocks and LRU caches immediately on `clear()`, `clearWorkQueue()`, `clearManagedAccountState()`, `clearFusionAccounts()`, and `clearIdentities()`.

**Non-Goals:**
- `/tmp` or filesystem spilling (futile on `memfs`).
- Two-pass / streaming pipeline re-architecture across `Refresh` and `Process` (Option 3).
- Changing any ISC API protocol, connector configuration surface, or `RunStateSnapshot` JSON format.

## Decisions

### D1: Generic `CompressedBlockMap<V>` with raw DEFLATE level 1
- **Choice**: Implement `CompressedBlockMap<V> extends Map<string, V>` in `src/model/compressedBlockMap.ts`. Entries up to `inHeapLimit` (default `10_000`) stay in `super` (`Map`) as live JS objects. Additional entries are appended to a mutable staging block (`pending: V[]`, up to `blockSize = 128` records). When `pending.length === blockSize`, it is serialized as `JSON.stringify(pending)` and compressed with `zlib.deflateRawSync(Buffer.from(json, 'utf8'), { level: 1 })` into `sealedBlocks: Buffer[]`, and `pending` is reset.
- **Reason**: Level 1 raw DEFLATE achieves ~12:1 compression on repetitive account/identity JSON at ~500k records/sec (~2.6s for 1.35M accounts, ~0.25ms per 128-record block — negligible vs network I/O and never blocks the event loop). Using 128 records/block keeps random-access decompression latency under ~0.2ms while preserving ~10–12x compression.
- **Considered alternatives**:
  - Uncompressed `Buffer` slabs (`CompactManagedAccountMap`) — still keeps ~712 MB in RSS.
  - `brotli` / `gzip` level 6 — 5–15x slower compression CPU for marginal extra ratio.
  - `/tmp` disk spill — container filesystem is `memfs`, so disk bytes still count against container RSS.

### D2: Bounded LRU cache for decompressed blocks
- **Choice**: Maintain a small `Map<number, V[]>` LRU cache (`lruCapacity = 16` blocks) inside `CompressedBlockMap`. Sequential scans (`values()`, `entries()`) iterate block-by-block (or hit the same block 128 times in a row), decompressing each sealed block only once. Random lookups (e.g. `Refresh` `get(key)`) keep the 16 hottest blocks decoded (~2,048 records, <2 MB).
- **Reason**: Prevents repeated decompression of the same block during sequential iteration or localized `Refresh` lookups without letting decoded blocks re-inflate V8 heap.
- **Considered alternatives**:
  - No read cache — `values()` over 1.35M records would decompress every block 128 times.
  - Unbounded cache — would defeat compression during `Refresh`/`Process`.

### D3: Source-partitioned key index (Option 4)
- **Choice**: When `partitionCompositeKeys: true` (enabled for `managedAccountsById`, `claimedAccountRetention`, and `managedAccountInventory`), `CompressedBlockMap` splits keys on the first `::` into `(sourceId, nativeIdentity)` and stores slots in `partitions: Map<string, Map<string, number>>` where `slot = blockIndex * blockSize + recordIndex` (with a special sentinel for the active `pending` block). Keys without `::` go into the `""` partition. `keys()`, `entries()`, and `forEach()` reconstruct `${sourceId}::${nativeIdentity}` on the fly.
- **Reason**: Drops the 34-byte `<sourceId>::` prefix from 1.35M+ key strings (~50–90 MB V8 heap saved per map) while keeping exact `Map<string, V>` external behavior.
- **Considered alternatives**:
  - Flat `Map<string, number>` — duplicates `sourceId::` in every key string.
  - Numeric hashing of keys — risks hash collisions and cannot reconstruct original keys for `keys()`/`entries()`.

### D4: Overwrite, delete, and compaction semantics
- **Choice**:
  - `set(key, value)` on an existing sealed-block key appends the new value to `pending` and updates the key's slot pointer (tombstoning the old slot implicitly since only live index entries are yielded by `entries()`/`values()`).
  - `delete(key)` removes the key from `super` or its partition `Map`. When `size === 0` (or all compressed entries are deleted), `sealedBlocks`, `pending`, and the LRU cache are released immediately.
  - `clear()` resets `super`, `partitions`, `sealedBlocks`, `pending`, and the LRU cache immediately.
- **Reason**: Avoids expensive in-place block recompression on delete/claim while ensuring memory is reclaimed as soon as a map drains or clears.

### D5: Apply `CompressedBlockMap` to all 5 fetched-population maps + compact `managedAccountsByIdentityId`
- **Choice**:
  1. `FusionRun.managedAccountsById`: `new CompressedBlockMap<Account>({ partitionCompositeKeys: true })`
  2. `FusionRun.claimedAccountRetention`: `new CompressedBlockMap<Account>({ partitionCompositeKeys: true })`
  3. `FusionRun.managedAccountInventory`: `new CompressedBlockMap<ManagedAccountInfo>({ partitionCompositeKeys: true })`
  4. `FusionRun.identityMapValue`: `new CompressedBlockMap<IdentityDocument>()`
  5. `SourceService.fusionAccountsByNativeIdentity`: `new CompressedBlockMap<Account>()`
  6. `FusionRun.managedAccountsByIdentityId`: Wrap in a compact `CompactStringSetMap extends Map<string, Set<string>>` (or internal `Map<string, string | Set<string>>` with `Map`-compatible surface) that stores a bare `string` when an identity has 1 managed account and promotes to `Set<string>` only on the 2nd account — returning a lightweight `Set` view on `.get(identityId)` and keeping `getKeysForIdentity` / `claimAccount` / `claimAccountsForIdentity` O(1) without allocating 1M+ `Set` objects during `Fetch`.
- **Reason**: Eliminates all remaining multi-hundred-megabyte V8 object graphs accumulated during `Fetch`.
- **Considered alternatives**:
  - Compressing only `managedAccountsById` — leaves `managedAccountInventory` (~350 MB), `managedAccountsByIdentityId` (~280 MB), `fusionAccountsByNativeIdentity`, and `identityMap` uncompressed in V8 heap.

## Risks / Trade-offs

- [Trade-off] Random `get(key)` on a sealed block incurs ~0.2ms decompression -> Reason for acceptance: 128-record blocks + 16-block LRU keep `Refresh` fast while cutting RSS by 3–5x.
- [Risk] `managedAccountsByIdentityId.get(id)` callers that mutate the returned `Set` directly (e.g. unit tests doing `run.managedAccountsByIdentityId.get(id)?.add(...)`) -> Mitigation: If `.get(id)` is called on a single-string entry, promote that entry to a real `Set<string>` in place (while internal `FusionRun` methods `setManagedAccount`, `claimAccount`, `claimAccountsForIdentity`, and `getKeysForIdentity` use dedicated non-promoting helpers), so external `Map<string, Set<string>>` mutation semantics remain 100% intact.
- [Risk] `JSON.stringify` / `JSON.parse` drops `undefined` properties or `Date` instances -> Mitigation: Fetched ISC accounts, `ManagedAccountInfo`, and `IdentityDocument` are JSON payloads from ISC APIs (or string-valued Internal Records); `undefined` property omission matches JSON semantics already used by `CompactManagedAccountMap` and `FusionRun.snapshot()`.
- [Risk] Overwriting many keys in sealed blocks leaves dead bytes until `clear()` -> Mitigation: Fetched maps are write-once during `Fetch` and read/deleted during `Refresh`/`Process`, then cleared at phase boundaries (`clearFusionAccounts`, `identities.clear`, `clearManagedAccounts`).

## Migration Plan

N/A — This change is purely internal to connector memory storage and does not involve deployment, schema, or configuration changes.

## Open Questions

- None.
