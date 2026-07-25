## MODIFIED Requirements

### Requirement: FusionRun SHALL maintain managed account inventory separate from the work queue

FusionRun SHALL maintain `managedAccountInventory`, a map of managed account keys to `ManagedAccountInfo` records containing at minimum `id`, `name`, `sourceName`, and optionally `sourceId`, `nativeIdentity`, and `identityId`. The inventory SHALL be populated when `setManagedAccount` is called and SHALL retain every key loaded during the run until explicitly cleared, independent of work-queue depletion via `claimAccount`.

#### Scenario: Inventory retains keys after work queue claim
- **WHEN** `claimAccount` removes the key from `managedAccountsById`
- **THEN** `managedAccountInventory` SHALL still contain the key and its metadata
- **AND** `hasManagedAccount(key)` SHALL return true

#### Scenario: Inventory stores identityId for claim fallback
- **WHEN** `setManagedAccount` registers a managed account with a non-empty `identityId`
- **THEN** `managedAccountInventory.get(key).identityId` SHALL equal that identity id
- **AND** FormService MAY use inventory `identityId` when invoking `claimAccount` after the work-queue entry was already removed in the same Fetch pass
