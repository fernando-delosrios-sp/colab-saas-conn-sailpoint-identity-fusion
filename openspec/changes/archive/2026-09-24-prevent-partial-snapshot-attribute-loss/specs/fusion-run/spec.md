## ADDED Requirements

### Requirement: FusionRun retains claimed managed account attribute bodies

FusionRun SHALL retain managed account attribute bodies after `claimAccount` (and after identity bulk claim) in a **claimed account retention** store keyed by managed account key, so FusionLayers can rematerialize source snapshots later in the same run. Retention SHALL NOT be a Match work queue: Match and uncorrelated sweeps SHALL NOT pull work from retention. `clearWorkQueue` and `clearManagedAccountState` SHALL clear retention. FusionRun SHALL expose a read accessor for rematerialization (for example get-retained-account-by-key). Retention MAY store the full `Account` or an equivalent attributes payload sufficient for source snapshot materialization.

#### Scenario: Claim moves attribute body into retention

- **GIVEN** a managed account key loaded via `setManagedAccount` with non-empty attributes
- **WHEN** `claimAccount` removes the key from `managedAccountsById`
- **THEN** the work queue SHALL no longer return that account via `get(key)`
- **AND** claimed account retention SHALL still provide that account’s attributes for rematerialization

#### Scenario: Retention clears with managed account state

- **GIVEN** claimed account retention holds at least one key
- **WHEN** `clearManagedAccountState` runs
- **THEN** claimed account retention SHALL be empty
- **AND** the work queue and inventory SHALL be empty afterward

#### Scenario: Match does not consume retention as a work queue

- **GIVEN** a key exists only in claimed account retention
- **WHEN** Match or an uncorrelated sweep looks for remaining work-queue accounts
- **THEN** that key SHALL NOT be returned as unfinished Match work

---

## MODIFIED Requirements

### Requirement: FusionRun maintains a lightweight managed account inventory

FusionRun SHALL maintain `managedAccountInventory`, a map of managed account keys to `ManagedAccountInfo` records containing at minimum `id`, `name`, `sourceName`, and optionally `sourceId`, `nativeIdentity`, and `identityId`. The inventory SHALL be populated when `setManagedAccount` is called and SHALL retain every key loaded during the run until explicitly cleared, independent of work-queue depletion via `claimAccount`. Inventory SHALL remain metadata-only. Claimed account retention is a separate store for post-claim attribute bodies and SHALL NOT replace or duplicate inventory responsibilities.

#### Scenario: Inventory retains keys after work queue claim
- **GIVEN** a managed account key loaded via `setManagedAccount`
- **WHEN** `claimAccount` removes the key from `managedAccountsById`
- **THEN** `hasManagedAccount(key)` SHALL still return true
- **AND** `getManagedAccountInfo(key)` SHALL return the cached metadata

#### Scenario: Inventory stores identityId for claim fallback
- **WHEN** `setManagedAccount` registers a managed account with a non-empty `identityId`
- **THEN** `managedAccountInventory.get(key).identityId` SHALL equal that identity id
- **AND** FormService MAY use inventory `identityId` when invoking `claimAccount` after the work-queue entry was already removed in the same Fetch pass

#### Scenario: Inventory is populated in setManagedAccount only
- **WHEN** SourceService loads a managed account
- **THEN** it SHALL call `run.setManagedAccount(key, account)` once
- **AND** FusionRun SHALL update both the work queue and inventory in that method
- **AND** no caller SHALL write inventory from a parallel discovery path
- **AND** claimed account retention MAY hold attribute bodies after claim without being treated as a second Match work queue or as inventory

### Requirement: FusionRun exposes managed account inventory accessors

FusionRun SHALL expose `hasManagedAccount(key: string): boolean`, `getManagedAccountInfo(key: string): ManagedAccountInfo | undefined`, and `clearManagedAccountState(): void` for managed account lifecycle operations. External code SHALL use these accessors instead of reading a full-account Match work-queue snapshot map. Claimed account retention accessors used for rematerialization are separate from inventory accessors.

#### Scenario: Form service checks account existence via accessor
- **WHEN** FormService determines whether a managed account still exists in the run
- **THEN** it SHALL call `run.hasManagedAccount(accountId)`
- **AND** it SHALL NOT read from a resurrected Match work-queue full-account map

#### Scenario: Report service resolves display metadata via accessor
- **WHEN** ReportService resolves a managed account display name or ISC account id
- **THEN** it SHALL call `run.getManagedAccountInfo(managedAccountKey)`
- **AND** it SHALL NOT read from a resurrected Match work-queue full-account map

#### Scenario: Output phase clears managed account state
- **WHEN** SourceService clears managed accounts at output phase
- **THEN** it SHALL call `run.clearManagedAccountState()`
- **AND** the work queue, inventory, and claimed account retention SHALL be empty afterward
