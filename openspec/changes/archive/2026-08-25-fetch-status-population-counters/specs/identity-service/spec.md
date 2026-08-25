## MODIFIED Requirements

### Requirement: Identity Fetch SHALL report ingested progress on the STATUS line

During identity bulk ingest, `IdentityService` SHALL update the Fetch `identities` population counter as in-scope documents are registered. When the ingest total is known and greater than zero, the service SHALL emit one DETAIL line with `action=ingesting identities` and `count=` before ingest work. Empty identity Fetch SHALL NOT set an `identities` counter. Identity Fetch SHALL NOT call `setProgress` with unit `ingested` as the Fetch pipeline slot.

#### Scenario: STATUS shows ingested progress during identity cache fill

- **GIVEN** identity Fetch is registering 1000 in-scope documents
- **AND** the operation heartbeat is active
- **WHEN** ingest is in progress
- **THEN** the `identities` Fetch population counter SHALL be updated
- **AND** a subsequent STATUS line SHALL include `identities=`
- **AND** the line SHALL NOT use `progress=` with unit `ingested` for that work

#### Scenario: Empty identity Fetch skips ingested progress

- **GIVEN** identity Fetch returns zero in-scope documents
- **WHEN** `fetchIdentities` completes
- **THEN** the service SHALL NOT set an `identities` Fetch population counter

#### Scenario: Skipped identity Fetch omits identities STATUS segment

- **GIVEN** identity Fetch is skipped for the run
- **WHEN** Fetch STATUS ticks fire
- **THEN** STATUS lines SHALL NOT include `identities=`
