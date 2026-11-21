## Scope

In: Replace uncompressed fetched-record storage across `FusionRun` and `SourceService` with a compressed in-memory block store, source-partitioned keys (Option 4), and compact metadata/identity indexes (Option 1) so 1.35M+ account aggregations stay well within SailPoint SaaS Connectivity container RSS limits. Out: `/tmp` disk spilling (container filesystem is `memfs`, so disk spill still consumes RAM) and streaming/two-pass pipeline re-architecture (Option 3).

## Language

No new domain terms need promotion to `openspec/specs/ubiquitous-language/spec.md`; existing canonical terms (**Match work queue**, **claimed account retention**, **managed account inventory**, **managed source account**, **Fusion account**, **Identity document**) apply unchanged.

**Compressed block store** (`draft`):
An internal `Map`-compatible storage backing that groups serialized records into fixed-size blocks compressed in memory with raw DEFLATE (`zlib.deflateRawSync`, level 1) and serves reads through a bounded LRU cache of decompressed blocks.
_Avoid_: slab cache, disk spill, swap file

**Source-partitioned key index** (`draft`):
A two-level key lookup (`sourceId → nativeIdentity → slot`) that avoids storing the repeated `<sourceId>::` prefix inside millions of composite managed-account key strings while preserving the external composite key contract (`<sourceId>::<nativeIdentity>`).
_Avoid_: sharded database, raw key split

## Decisions

- **Context**: Live Purdue aggregation (`1,348,596` managed accounts) hit `mem=4298.82MB heap=2427.96MB gc=301ms cpu=91%` near the end of `Fetch`, triggering 15–20s container stalls and `command expired`. Even after moving `managedAccountsById` to uncompressed 4 MiB `Buffer` slabs (`CompactManagedAccountMap`), benchmarked RSS for 1.35M accounts remained `1,624 MB` (`850 MB` heap + `712 MB` uncompressed `ArrayBuffer`), plus `fusionAccountsByNativeIdentity` and `identityMap` uncompressed in V8 heap.
- **Q1 — Why not spill to `/tmp` (Option 2)?** → Container filesystem in SailPoint SaaS Connectivity is `memfs` (RAM-backed), so writing to `/tmp` still consumes container RSS. Ruled out.
- **Q2 — Why not two-pass streaming (Option 3)?** → Breaks the 5-phase pipeline contracts (`Refresh` prune-deleted and cross-source deferred matching) and requires a much larger redesign. Deferred.
- **Q3 — Chosen direction (Option 1 + Option 4)**:
  1. Replace uncompressed slabs with a **compressed in-memory block store** (`zlib.deflateRawSync` level 1, 128–256 records/block, bounded LRU read cache). Benchmarked 12:1 compression (`712 MB → 58.6 MB` in `2.6s`, total RSS `535 MB` vs `1,624 MB`).
  2. **Source-partitioned key indexing (Option 4)**: Store composite managed-account keys (`<sourceId>::<nativeIdentity>`) in a two-level `Map<sourceId, Map<nativeIdentity, slot>>` internally so the 34-byte `<sourceId>::` prefix is not duplicated across 1.35M+ key strings (~50–90 MB saved).
  3. **Compact `managedAccountInventory` and `managedAccountsByIdentityId`**: Back `managedAccountInventory` with the same compressed/partitioned store (or shared metadata backing) instead of 1.35M live JS objects (~350 MB saved), and avoid allocating a `new Set()` per single-account identity in `managedAccountsByIdentityId` (~200+ MB saved when correlated).
  4. **Apply compressed block storage to `fusionAccountsByNativeIdentity` and `identityMap`**: Eliminates the remaining uncompressed V8 object graphs held concurrently during `Fetch` and `Refresh`.

## Open questions

- None blocking. Block size (`128` vs `256` records) and LRU cache capacity (`16` blocks) will be finalized in `design.md` and tuned via unit/benchmark verification.

## Scenarios discussed

- Small runs and unit tests (`<= inHeapLimit`, e.g. `<= 10_000` entries or configurable in tests): entries remain live JS objects in memory so existing object-identity expectations (`toBe`) and zero-compression fast paths hold.
- Large runs (`> inHeapLimit`, e.g. `1.35M` managed accounts): records spill into compressed blocks; `.get()`, `.has()`, `.delete()`, `.size`, `.keys()`, `.values()`, `.entries()`, `forEach()`, and `[Symbol.iterator]()` behave identically to a standard `Map`.
- Overwriting or deleting an entry in a compressed block: updates/deletes the slot index without corrupting sibling records in the same block; `clear()` releases all compressed blocks and LRU cache immediately.
- Composite keys with and without `::` separator: keys containing `::` partition on the first `::` (`sourceId`, `nativeIdentity`); keys without `::` fall back to a default partition so non-composite keys (e.g. in tests or `fusionAccountsByNativeIdentity` / `identityMap`) work seamlessly.
- `managedAccountInventory` retains metadata after `claimAccount()` deletes from `managedAccountsById`, and `FusionRun.snapshot()` / `FusionRun.restore()` serialize and restore identically.
- `managedAccountsByIdentityId` preserves `getKeysForIdentity(id)` and `Map<string, Set<string>>` compatibility while avoiding per-identity `Set` allocation for single-account identities during bulk ingest.
- `SourceService.fusionAccountsByNativeIdentity` and `FusionRun.identityMap` use compressed block storage for large populations and release all blocks on `clearFusionAccounts()` / `identities.clear()`.
