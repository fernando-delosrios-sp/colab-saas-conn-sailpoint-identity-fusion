## ADDED Requirements

### Requirement: FusionRun fetched-record maps SHALL use compressed in-memory block storage above the in-heap threshold

`FusionRun` SHALL back `managedAccountsById`, `claimedAccountRetention`, `managedAccountInventory`, and `identityMap` with a `Map`-compatible compressed in-memory block store (`CompressedBlockMap`). Entries up to the in-heap threshold (default `10_000`) SHALL stay as live objects; additional entries SHALL be stored in raw-DEFLATE compressed blocks in memory and served through a bounded LRU read cache. The store MUST NOT write to the filesystem.

#### Scenario: Small run preserves direct object identity
- **GIVEN** a `CompressedBlockMap` configured with an in-heap threshold of `10_000`
- **WHEN** fewer than `10_000` managed source accounts are stored via `setManagedAccount`
- **THEN** `run.managedAccountsById` SHALL remain an instance of `Map`
- **AND** `run.managedAccountsById.get(key)` SHALL return the exact object reference stored

#### Scenario: Large run compresses spilled blocks in memory with full Map parity
- **GIVEN** a `CompressedBlockMap` configured with an in-heap threshold of `2` and block size of `4`
- **WHEN** `12` managed source accounts are inserted, read, overwritten, deleted, and iterated via `keys()`, `values()`, `entries()`, `forEach()`, and `[Symbol.iterator]()`
- **THEN** all spilled entries SHALL be compressed in sealed raw-DEFLATE blocks in memory
- **AND** every `Map` operation (`size`, `has`, `get`, `delete`, and all iterators) SHALL return results identical to a standard `Map`

#### Scenario: Clearing the store releases all compressed blocks and read caches
- **GIVEN** a `FusionRun` holding compressed blocks in `managedAccountsById`, `claimedAccountRetention`, `managedAccountInventory`, and `identityMap`
- **WHEN** `clearWorkQueue()`, `clearManagedAccountState()`, or `clearIdentities()` is called
- **THEN** the cleared store's `size` SHALL become `0`
- **AND** all sealed compressed blocks, pending staging buffers, and LRU cache entries for that store SHALL be released immediately

---

### Requirement: Composite managed-account key maps SHALL partition keys by sourceId

When `CompressedBlockMap` enables composite key partitioning (used by `managedAccountsById`, `claimedAccountRetention`, and `managedAccountInventory`), keys containing `::` SHALL be indexed in a two-level `sourceId → nativeIdentity → slot` map so `<sourceId>::` is not duplicated per entry. Non-composite keys SHALL use a fallback partition, and external iterators SHALL reconstruct full keys unchanged.

#### Scenario: Composite keys round-trip without duplicating sourceId prefixes
- **GIVEN** a source-partitioned `CompressedBlockMap` with multiple managed source accounts sharing `sourceId` `"src-ad-1"`
- **WHEN** accounts are stored under `"src-ad-1::user-1"` through `"src-ad-1::user-20"` and later read via `get`, `has`, `keys`, `entries`, and `delete`
- **THEN** internal partitions SHALL store `"src-ad-1"` once as the outer partition key and `"user-1"` through `"user-20"` as inner keys
- **AND** external `keys()` and `entries()` SHALL yield `"src-ad-1::user-1"` through `"src-ad-1::user-20"`

#### Scenario: Non-composite keys remain supported in the fallback partition
- **GIVEN** a source-partitioned `CompressedBlockMap`
- **WHEN** an entry is stored under a key without `::` (such as `"plain-id"`)
- **THEN** `get("plain-id")`, `has("plain-id")`, `keys()`, and `delete("plain-id")` SHALL behave identically to a standard `Map`

---

### Requirement: FusionRun managedAccountsByIdentityId SHALL avoid per-identity Set allocation for single-account identities

`FusionRun.managedAccountsByIdentityId` SHALL store single-account identity links without allocating a `Set<string>` during `setManagedAccount`, promoting an entry to `Set<string>` only when a second key is added for the same `identityId` or when `managedAccountsByIdentityId.get(identityId)` is called externally. Internal `FusionRun` methods SHALL operate on the compact representation directly.

#### Scenario: Single-account identity links do not allocate Sets during bulk ingest
- **GIVEN** a `FusionRun` ingesting managed source accounts where each `identityId` maps to one managed account key
- **WHEN** `setManagedAccount` registers those accounts and `claimAccount` or `claimAccountsForIdentity` later claims them
- **THEN** `managedAccountsByIdentityId` SHALL remain an instance of `Map`
- **AND** single-account entries SHALL NOT allocate `Set` objects during `setManagedAccount` or `claimAccount`
- **AND** `claimAccountsForIdentity(identityId)` SHALL claim the account and remove the identity entry

#### Scenario: Multi-account identity links and direct Map.get callers remain fully compatible
- **GIVEN** a `FusionRun` with one managed account registered for `identityId` `"id-1"`
- **WHEN** a second managed account is registered for `"id-1"` or a caller reads `run.managedAccountsByIdentityId.get("id-1")`
- **THEN** `run.managedAccountsByIdentityId.get("id-1")` SHALL return a `Set<string>` containing all registered managed account keys for `"id-1"`
- **AND** `getKeysForIdentity("id-1")` SHALL contain every registered key for `"id-1"`
