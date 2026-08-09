## ADDED Requirements

### Requirement: SourceService maintains discovery-session source metadata indexes

SourceService SHALL maintain discovery-session source metadata in `_allSources` (ordered full list) and `sourcesById` (Map keyed by ISC source id). Both structures SHALL be populated atomically when `fetchAllSources` completes, using the same `SourceInfo` object references written to `run.sourcesByName`. SourceService SHALL use `sourcesById` for id-keyed account fetch, aggregation, and rebuild paths. SourceService SHALL expose name-keyed lookups to callers via `getSourceByName`, which reads from `run.sourcesByName`.

SourceService `_allSources` and `sourcesById` are discovery-session caches on SourceService and are not part of `RunStateSnapshot`. They are out of scope for the FusionRun cross-service inventory contract except that they MUST be populated in the same discovery pass as `run.sourcesByName`.

#### Scenario: Discovery populates all indexes atomically

- **WHEN** `SourceService.fetchAllSources` completes successfully
- **THEN** `_allSources` SHALL contain every resolved configured source plus the fusion source when found
- **AND** `sourcesById` SHALL contain an entry for each resolved source id
- **AND** `run.sourcesByName` SHALL contain an entry for each resolved source name
- **AND** each index SHALL reference the same `SourceInfo` objects for a given source

#### Scenario: getSourceById reads discovery id index

- **WHEN** a caller invokes `SourceService.getSourceById(id)`
- **THEN** SourceService SHALL return the entry from `sourcesById`
- **AND** it SHALL NOT require a lookup in `run.sourcesByName`

#### Scenario: getSourceByName reads FusionRun name index

- **WHEN** a caller invokes `SourceService.getSourceByName(name)`
- **THEN** SourceService SHALL return the entry from `run.sourcesByName`
- **AND** it SHALL NOT read from `sourcesById`

#### Scenario: getSourceConfig falls back to static connector config

- **GIVEN** a source name is not present in `run.sourcesByName` (for example the fusion source after reviewer initialization)
- **WHEN** `SourceService.getSourceConfig(sourceName)` is called
- **THEN** SourceService SHALL fall back to the static connector `sources` configuration when the name map entry is absent
- **AND** it SHALL return the configured `SourceConfig` when defined

---

## MODIFIED Requirements

### Requirement: SourceService writes account data to FusionRun

SourceService SHALL write all **managed account** inventory data to FusionRun rather than maintaining service-local account copies. SourceService SHALL NOT hold its own `managedAccountsAllById` or `managedAccountsByIdentityId` fields. Each fetched managed account SHALL be registered via `run.setManagedAccount`, which SHALL populate both the work queue and the lightweight inventory.

Source metadata follows a separate contract: SourceService SHALL register discovered sources on `run.sourcesByName` at discovery time and MAY maintain discovery-session indexes (`_allSources`, `sourcesById`) as documented in the source metadata indexing requirement. Account inventory and source metadata indexing are distinct concerns.

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

#### Scenario: Source discovery writes name map to FusionRun

- **WHEN** SourceService.fetchAllSources completes
- **THEN** each resolved source SHALL be registered on `run.sourcesByName`
- **AND** SourceService SHALL populate `sourcesById` in the same discovery pass
- **AND** managed account fetch SHALL not populate any service-local full-account snapshot map
