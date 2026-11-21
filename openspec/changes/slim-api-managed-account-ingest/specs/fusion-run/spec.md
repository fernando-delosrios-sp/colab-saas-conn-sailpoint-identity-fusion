## MODIFIED Requirements

### Requirement: FusionRun maintains a lightweight managed account inventory

FusionRun SHALL maintain `managedAccountInventory`, a map of managed account keys to `ManagedAccountInfo` records containing at minimum `id`, `name`, `sourceName`, and optionally `sourceId`, `nativeIdentity`, and `identityId`. The inventory SHALL be populated when `setManagedAccount` is called and SHALL retain every key loaded during the run until explicitly cleared, independent of work-queue depletion via `claimAccount`. When `account.uncorrelated === true`, `setManagedAccount` SHALL omit `identityId` from `managedAccountInventory` and `claimedAccountRetention` and SHALL NOT index `account.identityId` in `managedAccountsByIdentityId`. Inventory SHALL remain metadata-only. Claimed account retention is a separate store for post-claim attribute bodies and SHALL NOT replace or duplicate inventory responsibilities.

#### Scenario: Inventory retains keys after work queue claim
- **GIVEN** a managed account key loaded via `setManagedAccount`
- **WHEN** `claimAccount` removes the key from `managedAccountsById`
- **THEN** `hasManagedAccount(key)` SHALL still return true
- **AND** `getManagedAccountInfo(key)` SHALL return the cached metadata

#### Scenario: Inventory stores identityId for claim fallback
- **WHEN** `setManagedAccount` registers a managed account with a non-empty `identityId` and `uncorrelated` is not `true`
- **THEN** `managedAccountInventory.get(key).identityId` SHALL equal that identity id
- **AND** FormService MAY use inventory `identityId` when invoking `claimAccount` after the work-queue entry was already removed in the same Fetch pass

#### Scenario: Uncorrelated managed account shadow identityId is not indexed or stored in inventory
- **GIVEN** a managed source account with `uncorrelated: true` and a non-empty ISC shadow `identityId`
- **WHEN** `setManagedAccount` registers the account
- **THEN** `managedAccountsByIdentityId.has(account.identityId)` SHALL be `false`
- **AND** `getManagedAccountInfo(key)?.identityId` SHALL be `undefined`

#### Scenario: Inventory is populated in setManagedAccount only
- **WHEN** SourceService loads a managed account
- **THEN** it SHALL call `run.setManagedAccount(key, account)` once
- **AND** FusionRun SHALL update both the work queue and inventory in that method
- **AND** no caller SHALL write inventory from a parallel discovery path
- **AND** claimed account retention MAY hold attribute bodies after claim without being treated as a second Match work queue or as inventory

---

### Requirement: FusionRun fetched-record maps SHALL use compressed in-memory block storage above the in-heap threshold

`FusionRun` SHALL back `managedAccountsById`, `claimedAccountRetention`, `managedAccountInventory`, and `identityMap` with a `Map`-compatible compressed in-memory block store (`CompressedBlockMap`). Entries up to the in-heap threshold (default `10_000`) SHALL stay as live objects; additional entries SHALL be stored in raw-DEFLATE compressed blocks in memory and served through a bounded LRU read cache. When all records in an individual sealed block are deleted or overwritten, `CompressedBlockMap` SHALL release that block's compressed buffer and evict its LRU cache entry immediately without waiting for the entire map to empty. The store MUST NOT write to the filesystem.

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

#### Scenario: Draining all keys in one sealed block releases that block immediately
- **GIVEN** a `CompressedBlockMap` holding multiple sealed compressed blocks
- **WHEN** every key belonging to the first sealed block is deleted via `delete(key)` while later sealed blocks still retain live keys
- **THEN** the first sealed block's compressed buffer SHALL be released (`byteLength === 0`) and evicted from the LRU read cache immediately
- **AND** all remaining keys in later blocks SHALL continue to resolve accurately via `get(key)` and iterators

#### Scenario: Clearing the store releases all compressed blocks and read caches
- **GIVEN** a `FusionRun` holding compressed blocks in `managedAccountsById`, `claimedAccountRetention`, `managedAccountInventory`, and `identityMap`
- **WHEN** `clearWorkQueue()`, `clearManagedAccountState()`, or `clearIdentities()` is called
- **THEN** the cleared store's `size` SHALL become `0`
- **AND** all sealed compressed blocks, pending staging buffers, and LRU cache entries for that store SHALL be released immediately
