## MODIFIED Requirements

### Requirement: FusionRun is the only owner of managed source inventory maps

FusionRun SHALL be the single source of truth for **run-scoped, cross-service** source metadata indexed by source name (`sourcesByName`), managed account indexes, and `managedAccountInventory`. SourceService SHALL write discovered source metadata into `run.sourcesByName` at discovery time and SHALL write each managed account via `run.setManagedAccount`.

SourceService MAY maintain a **discovery-session** id-keyed index (`sourcesById`) and ordered discovery list (`_allSources`) populated atomically in the same discovery pass as `run.sourcesByName`. Those SourceService-local structures SHALL hold the same `SourceInfo` object references as the run name map at discovery time and SHALL NOT require ongoing hand-synchronization across service boundaries. SourceService SHALL use `sourcesById` for ISC API operations keyed by `sourceId` (fetch, aggregation, rebuild). Cross-service consumers SHALL read source metadata from `run.sourcesByName` by account `sourceName`, not from SourceService-local maps.

After `FusionService.initializeSourceReviewers` completes (at the end of identity processing), `run.sourcesByName` SHALL contain **managed sources only**. The fusion connector source SHALL remain available via SourceService (`sourcesById`, `_allSources`, `fusionSourceId`, `getFusionSource()`). This narrowing is intentional for matching, reviewer registration, and source-type lookups on managed accounts.

`RunStateSnapshot` SHALL serialize source metadata as `sourcesByName` only. Snapshots SHALL NOT include a `sourcesById` field. Restoring a snapshot repopulates the name map only; id-keyed SourceService operations SHALL require a subsequent `fetchAllSources` (or equivalent discovery bootstrap) to rebuild `sourcesById`.

#### Scenario: Matching reads source info from FusionRun

- **WHEN** `MatchOutcomeDispatcher` looks up source information for an account
- **THEN** it SHALL read from `run.sourcesByName` and not from a SourceService-local copy
- **AND** the lookup key SHALL be the account's `sourceName`

#### Scenario: SourceService writes name-indexed metadata to FusionRun at discovery

- **WHEN** `SourceService.fetchAllSources` completes source discovery
- **THEN** each resolved `SourceInfo` SHALL be registered in `run.sourcesByName` keyed by source name
- **AND** the same `SourceInfo` object references SHALL be registered in SourceService `sourcesById` keyed by source id in the same discovery pass
- **AND** SourceService SHALL write each subsequently fetched managed account via `run.setManagedAccount` rather than maintaining a service-local full-account snapshot

#### Scenario: SourceService id index is a discovery-session view

- **WHEN** SourceService performs fetch or aggregation keyed by ISC `sourceId`
- **THEN** it SHALL resolve `SourceInfo` from `sourcesById`
- **AND** it SHALL NOT require a separate synchronization step after populating `run.sourcesByName` at discovery

#### Scenario: Managed-only name map after reviewer initialization

- **GIVEN** source discovery has registered both managed sources and the fusion connector source on `run.sourcesByName`
- **WHEN** `FusionService.initializeSourceReviewers` completes after identity processing
- **THEN** `run.sourcesByName` SHALL contain every configured managed source
- **AND** `run.sourcesByName` SHALL NOT contain the fusion connector source
- **AND** SourceService `sourcesById` SHALL still resolve the fusion connector source by id

#### Scenario: Managed account inventory has a single canonical location

- **WHEN** any service needs managed account metadata after work-queue depletion
- **THEN** it SHALL call `run.getManagedAccountInfo(key)` or `run.hasManagedAccount(key)`
- **AND** no service-local full-account snapshot map SHALL exist in any service

#### Scenario: Snapshot serializes name-indexed source metadata only

- **WHEN** `run.snapshot()` is called during a run
- **THEN** the returned snapshot SHALL include `sourcesByName`
- **AND** the snapshot SHALL NOT include `sourcesById`
- **AND** the serialized `sourcesByName` SHALL reflect the current run phase (full discovery set before reviewer init; managed-only set afterward)

#### Scenario: Restore repopulates name map without id index

- **GIVEN** a snapshot captured from a run
- **WHEN** `FusionRun.restore(snapshot)` is called
- **THEN** `run.sourcesByName` SHALL match the snapshot's `sourcesByName` entries
- **AND** SourceService `sourcesById` SHALL remain unchanged until discovery is run again

---

## ADDED Requirements

### Requirement: Source metadata tiers are documented for implementers

Implementers SHALL treat SourceService `_allSources` as the ordered full discovery list (including fusion when resolved), `sourcesById` as the id-keyed discovery index for SourceService-internal API calls, and `run.sourcesByName` as the run-scoped name index for cross-service reads with a managed-only phase after reviewer initialization.

#### Scenario: Cross-service lookup uses FusionRun name index

- **GIVEN** a service outside SourceService needs source type or matching configuration for an account
- **WHEN** it resolves metadata by account `sourceName`
- **THEN** it SHALL read from `run.sourcesByName`
- **AND** it SHALL NOT read from SourceService `sourcesById`

#### Scenario: Id-keyed fetch uses SourceService discovery index

- **GIVEN** an operation invokes SourceService with an ISC `sourceId`
- **WHEN** SourceService resolves source metadata before calling the Accounts API
- **THEN** it SHALL read from `sourcesById`
- **AND** it MAY read from `run.sourcesByName` when the caller supplies source name instead of id
