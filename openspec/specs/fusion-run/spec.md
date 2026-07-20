# fusion-run Spec

## Purpose

FusionRun (`src/model/fusionRun.ts`) is the centralized state container for a single operation run. It holds all mutable data loaded during the run and serves as the single source of truth that stateless services read from and write to. It is NOT a service — it is a pure data container with no business logic or service dependencies.

## Requirements

### Requirement: FusionRun is the single source of truth for operation run state

FusionRun SHALL be the centralized state container for a single operation run. All services SHALL read from and write to FusionRun rather than holding internal mutable state. No mutable state relevant to the operation run SHALL exist outside FusionRun.

#### Scenario: Services read managed accounts from FusionRun
- **WHEN** any service needs access to managed source accounts
- **THEN** it SHALL read from run.managedAccountsById, not from a service-local field

#### Scenario: Match scoring updates FusionRun directly
- **WHEN** MatchingService computes match scoring duration
- **THEN** the duration SHALL be written to run.matchScoringMs, not accumulated in MatchingService

### Requirement: FusionRun holds all run-scoped data

FusionRun SHALL contain maps and sets for all data loaded and processed during an operation run: managed accounts, identities, Fusion accounts, Fusion identities, source information, form decisions, matching state, analysis recording, and timing metrics.

#### Scenario: FusionRun contains managed account state
- **WHEN** aggregation loads managed accounts
- **THEN** run.managedAccountsById SHALL contain all loaded managed accounts
- **AND** run.managedAccountsByIdentityId SHALL contain identity-grouped accounts

#### Scenario: FusionRun contains fusion processing state
- **WHEN** fusion accounts are processed
- **THEN** run.fusionAccountMap SHALL contain all fusion accounts
- **AND** run.fusionIdentityMap SHALL contain identity-linked fusion accounts
- **AND** run.autoAssignedIdentityIds SHALL track automatically assigned identities

#### Scenario: FusionRun contains matching state
- **WHEN** matching sweeps run
- **THEN** run.linkedAccountKeyIndex SHALL contain correlated account keys
- **AND** run.analysisRecorder SHALL capture per-account analysis results
- **AND** run.fusionBlends SHALL track blending events

### Requirement: FusionRun provides snapshot and restore for recording

FusionRun SHALL expose a `snapshot()` method that returns a complete serializable representation of the current state. It SHALL expose a `restore(snapshot)` method that reconstructs the state from a previously captured snapshot, enabling deterministic replay.

#### Scenario: Snapshot captures complete state
- **WHEN** run.snapshot() is called during a run
- **THEN** the returned snapshot SHALL contain: identities, managedAccounts, fusionAccounts, fusionIdentities, formDecisions, autoAssignedIds, analysisRecord, matchScoringMs, phaseTimings
- **AND** the snapshot SHALL be JSON-serializable

#### Scenario: Restore reconstructs identical state
- **GIVEN** a snapshot captured from a run
- **WHEN** a new FusionRun.restore(snapshot) is called
- **THEN** all maps, sets, and scalar values SHALL match the captured state
- **AND** services operating on the restored run SHALL see the same data

### Requirement: FusionRun is not a service

FusionRun SHALL NOT contain business logic, service dependencies, or side-effecting operations. It SHALL be a pure data container with accessor methods. The only transformations it performs SHALL be snapshot serialization and restore deserialization.

#### Scenario: FusionRun has no service dependencies
- **WHEN** FusionRun is instantiated
- **THEN** it SHALL NOT require LogService, LockService, ClientService, or any other service

#### Scenario: FusionRun has no business logic
- **WHEN** a service calls any FusionRun method
- **THEN** the method SHALL only read or write data, never coordinate between services or trigger side effects

### Requirement: RecordingService snapshots FusionRun directly

RecordingService SHALL call run.snapshot() to capture operation state, replacing the previous pattern of passing individual SourceService, IdentityService, and FormService references.

#### Scenario: RecordingService uses FusionRun snapshot
- **WHEN** RecordingService.startOperation is called
- **THEN** it SHALL receive FusionRun as a parameter
- **AND** it SHALL call run.snapshot() to capture the initial state
- **AND** it SHALL not access individual service internals
