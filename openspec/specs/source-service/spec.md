# source-service Spec

## Purpose

The source service (`src/services/sourceService/`) is the connector's read/write adapter for managed sources. It wraps the SailPoint API client's `AccountV2025` resource, provides jmespath-based account filtering, manages the source-specific reverse-correlation error vocabulary, and exposes the per-source type definitions. This spec defines the contract for how the connector resolves accounts from a source, applies the configured filters, and surfaces source-specific failure modes.
## Requirements
### Requirement: The source service MUST resolve accounts using the source's configured filters

The source service MUST resolve accounts from a managed source by applying configured filter expressions at fetch time. **Accounts API filter** (`accountFilter`) SHALL be composed into the ISC `listAccounts` `filters` query (server-side). **Accounts JMESPath filter** (`accountJmespathFilter`) SHALL be applied client-side to each fetched account page before accounts are registered on FusionRun. Source-specific reverse-correlation errors MUST be surfaced using the dedicated error vocabulary in `sourceReverseCorrelationErrors.ts` so the rest of the connector can distinguish them from generic upstream failures.

#### Scenario: A jmespath filter narrows the resolved account set

- **REMOVED** — superseded by **Accounts API filter narrows the resolved account set** and **Accounts JMESPath filter narrows each fetched page**. Prior scenario mislabeled ISC search syntax (`attributes.active eq true`) as JMESPath.

#### Scenario: Accounts API filter narrows the resolved account set

- **GIVEN** a managed source with Accounts API filter `attributes.active eq true`
- **WHEN** the source service fetches accounts for the source via `listAccounts`
- **THEN** the composed `filters` parameter SHALL include the configured filter clause
- **AND** only accounts returned by the ISC Accounts API for that query SHALL be registered on FusionRun
- **AND** accounts excluded by the server-side filter SHALL NOT be surfaced to the operations layer

#### Scenario: Accounts JMESPath filter narrows each fetched page

- **GIVEN** a managed source with Accounts JMESPath filter that selects a subset of accounts from a page
- **WHEN** the source service processes a page of accounts returned by the ISC Accounts API
- **THEN** only accounts retained by the JMESPath expression SHALL be registered on FusionRun
- **AND** accounts removed by the JMESPath filter SHALL NOT be surfaced to the operations layer

#### Scenario: A reverse-correlation failure surfaces a typed error

- **GIVEN** the source service cannot reverse-correlate a result to an account
- **WHEN** the operation handles the failure
- **THEN** the error is one of the typed entries from `sourceReverseCorrelationErrors.ts`
- **AND** the error is distinguishable from generic upstream `ConnectorError`s

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

### Requirement: Managed-account parallel fetch SHALL report page-level progress to the operation heartbeat

When fetching managed accounts via parallel offset pagination, `SourceService` SHALL update the Fetch `managed-accounts` population counter after each page is registered (`setManagedAccount`), using the aggregate registered count across all in-flight managed sources when multiple sources fetch concurrently. It SHALL NOT write managed-account progress through the shared `setProgress` unit `fetched` during Fetch.

#### Scenario: Aggregate fetch progress advances on each page completion

- **GIVEN** `fetchManagedAccounts` loading two sources concurrently via parallel pagination
- **WHEN** any managed-source page is registered
- **THEN** the `managed-accounts` Fetch population counter SHALL be updated with an aggregate registered count
- **AND** the total SHALL reflect known `X-Total-Count` sums when all active sources have known totals

#### Scenario: Single large source shows incremental heartbeat progress

- **GIVEN** a managed source with more than 1000 accounts fetched via parallel pagination
- **AND** heartbeat interval 10 seconds
- **WHEN** Fetch phase runs long enough for multiple STATUS ticks
- **THEN** STATUS `managed-accounts` `done` SHALL increase on more than one tick before the source completes
- **AND** increases SHALL correspond to page registrations rather than only multi-thousand-account batch jumps

### Requirement: Fusion-account Fetch SHALL ingest pages without blocking the event loop

`SourceService.fetchFusionAccounts` SHALL register each generator page into `fusionAccountsByNativeIdentity` as pages arrive. It SHALL NOT concatenate all pages into an intermediate array and then construct the map in one synchronous pass. After each page, the service SHALL yield to the event loop. The map SHALL replace any previous fetch result for the run (same assign-once semantics as today).

#### Scenario: Fusion accounts are registered per page

- **GIVEN** the fusion source returns multiple account pages from the accounts generator
- **WHEN** `fetchFusionAccounts` runs
- **THEN** each page's accounts SHALL be written to `fusionAccountsByNativeIdentity` before the next page is required
- **AND** the event loop SHALL be yielded after each page

#### Scenario: Fusion-account map replaces the previous result

- **GIVEN** `fusionAccountsByNativeIdentity` already contains accounts from an earlier fetch
- **WHEN** `fetchFusionAccounts` starts
- **THEN** the map SHALL be replaced so completed Fetch reflects only the current generator results

### Requirement: Fusion-account Fetch SHALL report ingested progress on the STATUS line

During fusion-account bulk ingest, `SourceService` SHALL update the Fetch `fusion-accounts` population counter as accounts are registered into `fusionAccountsByNativeIdentity`. When the ingest total is known and greater than zero, the service SHALL emit one DETAIL line with `action=ingesting fusion-accounts` and `count=` before ingest work. Empty fusion-account Fetch SHALL NOT set a `fusion-accounts` counter. Managed-account Fetch SHALL update `managed-accounts` only and SHALL NOT write `fusion-accounts`. Fusion-account Fetch SHALL NOT call `setProgress` with unit `ingested` or `fetched` as the Fetch pipeline slot.

#### Scenario: STATUS shows ingested progress during fusion-account map fill

- **GIVEN** fusion-account Fetch is registering 5000 fusion accounts
- **AND** the operation heartbeat is active
- **WHEN** ingest is in progress
- **THEN** the `fusion-accounts` Fetch population counter SHALL be updated
- **AND** a subsequent STATUS line SHALL include `fusion-accounts=` with that census
- **AND** the line SHALL NOT use `progress=` with unit `ingested` for that work

#### Scenario: Managed-account Fetch progress unit stays fetched

- **GIVEN** managed-account parallel fetch is paging a large source
- **WHEN** a page completes and accounts are registered via `setManagedAccount`
- **THEN** the `managed-accounts` Fetch population counter SHALL be updated
- **AND** the service SHALL NOT report those page registrations as `fusion-accounts`

