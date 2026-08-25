## MODIFIED Requirements

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
