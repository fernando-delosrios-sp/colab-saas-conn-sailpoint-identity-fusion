## ADDED Requirements

### Requirement: Identity Fetch SHALL ingest documents without blocking the event loop

When `includeIdentities` is enabled and an identity scope query runs, `IdentityService.fetchIdentities` SHALL register identity documents into FusionRun as search pages arrive (or in chunks of at most 250 documents when a collect-all array is the only available source). After each chunk or page, the service SHALL yield to the event loop (`yieldToEventLoop` / `setImmediate`) so Operation heartbeat and platform keep-alive timers can run. Protected identities SHALL continue to be excluded from the cache and from `identityIdsInScope`.

#### Scenario: Large identity search yields between ingest chunks

- **GIVEN** identity Fetch returns more than 250 in-scope identity documents
- **WHEN** `fetchIdentities` registers them on FusionRun
- **THEN** registration SHALL not run as a single uninterrupted synchronous loop over the full result
- **AND** the event loop SHALL be yielded at least once per 250 documents (or once per search page, whichever is smaller)

#### Scenario: Protected identities remain excluded

- **GIVEN** a search page contains a protected identity and an unprotected identity
- **WHEN** `fetchIdentities` ingests the page
- **THEN** only the unprotected identity SHALL be added to FusionRun
- **AND** only the unprotected identity SHALL be recorded in `identityIdsInScope`

### Requirement: Identity Fetch SHALL report ingested progress on the STATUS line

During identity bulk ingest, `IdentityService` SHALL call `log.setProgress(done, total, 'ingested')` as documents are registered. When the ingest total is known and greater than zero, the service SHALL emit one DETAIL line with `action=ingesting identities` and `count=` before ingest work. Empty identity Fetch SHALL NOT set progress unit `ingested`.

#### Scenario: STATUS shows ingested progress during identity cache fill

- **GIVEN** identity Fetch is registering 1000 in-scope documents
- **AND** the operation heartbeat is active
- **WHEN** ingest is in progress
- **THEN** `setProgress` SHALL be invoked with unit `ingested`
- **AND** a subsequent STATUS line SHALL include `progress=` with unit `ingested`

#### Scenario: Empty identity Fetch skips ingested progress

- **GIVEN** identity Fetch returns zero in-scope documents
- **WHEN** `fetchIdentities` completes
- **THEN** the service SHALL NOT call `setProgress` with unit `ingested`
