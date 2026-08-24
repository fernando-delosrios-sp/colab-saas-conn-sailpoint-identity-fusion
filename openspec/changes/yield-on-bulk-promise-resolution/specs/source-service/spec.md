## ADDED Requirements

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

During fusion-account bulk ingest, `SourceService` SHALL call `log.setProgress(done, total, 'ingested')` as accounts are registered. When the ingest total is known and greater than zero, the service SHALL emit one DETAIL line with `action=ingesting fusion-accounts` and `count=` before ingest work. Empty fusion-account Fetch SHALL NOT set progress unit `ingested`. Managed-account Fetch SHALL continue to report unit `fetched` per existing page-progress requirements and SHALL NOT switch to `ingested` for per-page `setManagedAccount` registration.

#### Scenario: STATUS shows ingested progress during fusion-account map fill

- **GIVEN** fusion-account Fetch is registering 5000 fusion accounts
- **AND** the operation heartbeat is active
- **WHEN** ingest is in progress
- **THEN** `setProgress` SHALL be invoked with unit `ingested`
- **AND** a subsequent STATUS line SHALL include `progress=` with unit `ingested`

#### Scenario: Managed-account Fetch progress unit stays fetched

- **GIVEN** managed-account parallel fetch is paging a large source
- **WHEN** a page completes and accounts are registered via `setManagedAccount`
- **THEN** `setProgress` SHALL use unit `fetched`
- **AND** the service SHALL NOT report those page registrations as `ingested`
