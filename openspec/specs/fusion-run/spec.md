# fusion-run Spec

## Purpose

FusionRun (`src/model/fusionRun.ts`) is the centralized state container for a single operation run. It holds all mutable data loaded during the run and serves as the single source of truth that stateless services read from and write to. It is a domain object with encapsulated collection-management methods and state-integrity validation — it is NOT a service orchestrator.
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
- **AND** run.sourcesByName SHALL map managed source names to SourceInfo
- **AND** run.currentRunNonMatchedKeysBySource SHALL track non-matched account keys per source

#### Scenario: FusionRun contains matching state
- **WHEN** matching sweeps run
- **THEN** run.linkedAccountKeyIndex SHALL contain correlated account keys
- **AND** run.analysisRecorder SHALL capture per-account analysis results
- **AND** run.fusionBlends SHALL track blending events

### Requirement: FusionRun holds form processing state

FusionRun SHALL contain the following form-related per-run state: fusion identity decisions, pending candidate identity IDs, and pending review URL mappings.

#### Scenario: FusionRun contains form decision state
- **WHEN** form decisions are processed during an operation run
- **THEN** run.fusionIdentityDecisions SHALL contain the processed fusion identity decisions
- **AND** run.pendingCandidateIdentityIds SHALL contain candidate identity IDs with pending form instances
- **AND** run.pendingReviewUrlsByReviewerId SHALL map reviewer identity IDs to pending form instance URLs
- **AND** run.pendingReviewUrlsByCandidateId SHALL map candidate identity IDs to pending form instance URLs

### Requirement: FusionRun provides snapshot and restore for recording

FusionRun SHALL expose a `snapshot()` method that returns a complete serializable representation of the current state. It SHALL expose a `restore(snapshot)` method that reconstructs the state from a previously captured snapshot, enabling deterministic replay.

#### Scenario: Snapshot captures complete state
- **WHEN** run.snapshot() is called during a run
- **THEN** the returned snapshot SHALL contain: managedAccounts, fusionAccounts, identities, formDecisions, fusionIdentityDecisions, pendingCandidateIdentityIds, pendingReviewUrlsByReviewerId, pendingReviewUrlsByCandidateId, sourcesByName, currentRunNonMatchedKeysBySource, fusionBlends, autoAssignedIds, matchScoringMs, phaseTimings
- **AND** the snapshot SHALL be JSON-serializable

#### Scenario: Restore reconstructs identical state
- **GIVEN** a snapshot captured from a run
- **WHEN** a new FusionRun.restore(snapshot) is called
- **THEN** all maps, sets, and scalar values SHALL match the captured state
- **AND** services operating on the restored run SHALL see the same data

### Requirement: FusionRun encapsulates collection management

FusionRun SHALL expose domain methods for all collection mutations. External code SHALL NOT directly mutate FusionRun's internal Maps, Sets, or Arrays. FusionRun SHALL own the knowledge of its internal storage topology.

#### Scenario: Registering a fusion account
- **WHEN** a processor needs to register a FusionAccount
- **THEN** it SHALL call run.registerFusionAccount(fa) rather than directly setting run.fusionAccountMap or run.fusionIdentityMap
- **AND** FusionRun SHALL determine the correct internal map based on the account's identityId and type

#### Scenario: Removing a fusion account
- **WHEN** a processor needs to remove a FusionAccount
- **THEN** it SHALL call run.removeFusionAccount(fa) rather than directly deleting from internal maps
- **AND** FusionRun SHALL locate and remove the account from whichever internal collection holds it

#### Scenario: Finding a fusion account for an identity
- **WHEN** a processor needs to check if an existing FusionAccount matches a newly-observed identity
- **THEN** it SHALL call run.findFusionAccountForIdentity(identity, sourceNames) rather than iterating internal maps directly
- **AND** FusionRun SHALL search both correlated and uncorrelated accounts internally

### Requirement: FusionRun is not a service orchestrator

FusionRun SHALL NOT orchestrate between services, trigger side effects in external systems, or coordinate multi-phase operations. It MAY perform collection-management validation (e.g., conflict detection, duplicate warnings) and MAY use LogService for state-integrity warnings.

#### Scenario: FusionRun may use LogService for validation
- **WHEN** registerFusionAccount detects a conflicting identity registration
- **THEN** it SHALL log a warning via LogService
- **AND** it SHALL NOT trigger side effects in other services

#### Scenario: FusionRun does not orchestrate services
- **WHEN** a FusionRun method is called
- **THEN** it SHALL NOT call methods on IdentityService, FormService, MatchService, or other services
- **AND** it SHALL NOT initiate API calls or modify external system state

### Requirement: FusionRun encapsulates identity cache operations

FusionRun SHALL expose methods for identity cache mutations: addIdentity, removeIdentity, clearIdentities, getIdentity, and hasIdentity. External code SHALL NOT directly mutate the identityMap.

#### Scenario: Adding an identity to the cache
- **WHEN** IdentityService fetches identities
- **THEN** it SHALL call run.addIdentity(id, document) rather than run.identityMap.set(id, document)

#### Scenario: Clearing the identity cache
- **WHEN** the identity cache needs to be reset
- **THEN** the caller SHALL call run.clearIdentities() rather than run.identityMap.clear()

### Requirement: FusionRun encapsulates scoring state

FusionRun SHALL expose methods for scoring state mutations: markAutoAssigned, isAutoAssigned, and resetScoringState. External code SHALL NOT directly mutate autoAssignedIdentityIds or matchScoringMs.

#### Scenario: Recording an auto-assignment
- **WHEN** the match engine auto-assigns an identity
- **THEN** it SHALL call run.markAutoAssigned(identityId) rather than run.autoAssignedIdentityIds.add(identityId)

#### Scenario: Resetting scoring state for a new run
- **WHEN** a new managed account processing phase starts
- **THEN** the orchestrator SHALL call run.resetScoringState() rather than manually clearing autoAssignedIdentityIds and resetting matchScoringMs

### Requirement: RecordingService snapshots FusionRun directly

RecordingService SHALL call run.snapshot() to capture operation state, replacing the previous pattern of passing individual SourceService, IdentityService, and FormService references.

#### Scenario: RecordingService uses FusionRun snapshot
- **WHEN** RecordingService.startOperation is called
- **THEN** it SHALL receive FusionRun as a parameter
- **AND** it SHALL call run.snapshot() to capture the initial state
- **AND** it SHALL not access individual service internals

### Requirement: FusionRun holds operation execution mode state

FusionRun SHALL contain boolean properties denoting the global execution mode of the run, specifically whether the run is executing in record mode (`isRecordMode`). This centralizes process environment variable access.

#### Scenario: FusionRun evaluates environment variables on initialization
- **WHEN** `FusionRun` is constructed
- **THEN** it reads `process.env.RECORD_MODE` exactly once and stores it in `isRecordMode`

### Requirement: FusionRun exposes managed account processing verbs

FusionRun SHALL expose domain verbs for managed account processing state mutations required by the Match step: `queueDisableOperation(account)`, `removeMatchAccount(id)`, and `claimAccount(key, identityId)`. External code SHALL NOT directly mutate internal queues or work queues.

#### Scenario: Match module queues a disable operation
- **WHEN** `MatchOutcomeDispatcher` determines that an orphan managed account should be disabled
- **THEN** it SHALL call `run.queueDisableOperation(account)` rather than mutating a service-local queue

#### Scenario: Match module removes a managed account from the work queue
- **WHEN** `MatchOutcomeDispatcher` determines that a managed account no longer needs matching
- **THEN** it SHALL call `run.removeMatchAccount(id)` rather than directly deleting from `run.managedAccountsById`

---

### Requirement: FusionRun exposes analysis recording verbs

FusionRun SHALL expose domain verbs that hide the internal `analysisRecorder` from callers: `trackFailed(fusionAccount, message)` and any other recorder operations needed by the Match step. External code SHALL NOT directly reference `run.analysisRecorder`.

#### Scenario: Match module records a failed form
- **WHEN** `MatchOutcomeDispatcher` fails to create a review form
- **THEN** it SHALL call `run.trackFailed(fusionAccount, message)` rather than `run.analysisRecorder!.trackFailed(...)`

#### Scenario: No non-null assertions on recorder
- **WHEN** code reviews inspect Match-step code
- **THEN** there SHALL be no `run.analysisRecorder!` references

---

### Requirement: FusionRun is the only owner of managed source inventory maps

FusionRun SHALL be the single source of truth for source inventory maps such as `sourcesByName` and managed account indexes. Other services SHALL NOT maintain parallel copies of these maps that must be hand-synchronized.

#### Scenario: Matching reads source info from FusionRun
- **WHEN** `MatchOutcomeDispatcher` looks up source information for an account
- **THEN** it SHALL read from `run.sourcesByName` and not from a `SourceService`-local copy

#### Scenario: SourceService populates FusionRun
- **WHEN** `SourceService` loads managed source accounts and source metadata
- **THEN** it SHALL write the source metadata into `run.sourcesByName` rather than storing it internally

### Requirement: Correlated identities are hydrated before the managed-account sweep

The connector SHALL ensure that the identity correlated to each fetched managed source account is present in the run-scoped identity cache before any Fusion account derived from that managed account is serialized.

#### Scenario: Managed account correlated to an identity outside the configured scope
- **WHEN** a managed source account fetched during aggregation has a non-empty `identityId`
- **AND** the identity is not in the run-scoped identity cache after the configured `identityScopeQuery` fetch
- **THEN** the connector SHALL hydrate the identity by id
- **AND** it SHALL apply the identity layer to the corresponding Fusion account before `getISCAccount` serializes it

#### Scenario: Multiple managed accounts correlated to the same identity
- **WHEN** two or more fetched managed accounts share the same `identityId`
- **THEN** the connector SHALL hydrate the identity once
- **AND** it SHALL apply the identity layer to each affected Fusion account

#### Scenario: Correlated identity is protected
- **WHEN** a hydrated identity is flagged as `protected`
- **THEN** the connector SHALL NOT apply the identity layer to the corresponding Fusion account

#### Scenario: No managed account has a correlated identity
- **WHEN** no fetched managed account has a non-empty `identityId`
- **THEN** the connector SHALL NOT perform any additional identity hydration
- **AND** it SHALL NOT add the identity layer to any Fusion account

#### Scenario: Hydration query length is bounded
- **WHEN** the connector hydrates correlated identities
- **THEN** it SHALL split the identity-id set into chunks of no more than 50 ids per query
- **AND** it SHALL execute the chunked queries in parallel with per-chunk error isolation

