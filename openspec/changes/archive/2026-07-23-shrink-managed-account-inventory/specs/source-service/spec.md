## MODIFIED Requirements

### Requirement: SourceService writes account data to FusionRun

SourceService SHALL write all account inventory data to FusionRun rather than maintaining service-local copies. SourceService SHALL NOT hold its own `managedAccountsAllById` or `managedAccountsByIdentityId` fields. Each fetched managed account SHALL be registered via `run.setManagedAccount`, which SHALL populate both the work queue and the lightweight inventory.

#### Scenario: Fetching managed accounts writes to FusionRun
- **WHEN** SourceService.fetchManagedAccounts is called for a managed source
- **THEN** each fetched account SHALL be written via `run.setManagedAccount(key, account)`
- **AND** `run.managedAccountInventory` SHALL contain metadata for every loaded key
- **AND** there SHALL be no service-local managedAccountsAllById field on SourceService
- **AND** SourceService SHALL NOT call a separate snapshot-map setter after `setManagedAccount`

#### Scenario: SourceService has no dead inventory fields
- **WHEN** code review inspects SourceService's class body
- **THEN** there SHALL be no `managedAccountsByIdentityId` or `managedAccountsAllById` fields declared on SourceService
- **AND** any reference to `this.managedAccountsByIdentityId` SHALL be replaced with `run.managedAccountsByIdentityId`

#### Scenario: resolveIscAccountIdForManagedKey uses inventory accessors
- **WHEN** SourceService.resolveIscAccountIdForManagedKey is called for a managed account key
- **THEN** it SHALL prefer the work queue entry when present
- **AND** it SHALL fall back to `run.getManagedAccountInfo(key)?.id` when the key is not in the work queue
- **AND** it SHALL NOT read from `managedAccountsAllById`
