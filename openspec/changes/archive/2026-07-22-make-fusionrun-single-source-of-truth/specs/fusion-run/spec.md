## MODIFIED Requirements

### Requirement: FusionRun holds all run-scoped data

FusionRun SHALL contain maps, sets, and state fields for all data loaded and processed during an operation run: managed accounts, identities, Fusion accounts, Fusion identities, source information, form decisions, form counters, form delete queue, matching state, aggregation tracker, trigram index, normalization caches, managed account processing state machine, analysis recording, and timing metrics.

#### Scenario: FusionRun contains managed account state
- **WHEN** aggregation loads managed accounts
- **THEN** run.managedAccountsById SHALL contain all loaded managed accounts
- **AND** run.managedAccountsByIdentityId SHALL contain identity-grouped accounts
- **AND** run.managedAccountsAllById SHALL be the canonical location for all accounts (populated by SourceService)

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
- **AND** run.trigramIndexByAttribute SHALL contain per-attribute inverted trigram maps
- **AND** run.normalizedCache and run.nameNormalizedCache SHALL contain normalization caches

#### Scenario: FusionRun contains form lifecycle state
- **WHEN** form processing runs
- **THEN** run.formsCreated, run.formInstancesCreated, run.formsFound, run.formInstancesFound, and run.answeredFormInstancesProcessed SHALL track form processing counters
- **AND** run.formsToDelete, run.formDeleteQueue, run.queuedFormDeleteIds, run.pendingFormDeleteTasks, and run.activeFormDeleteWorkers SHALL track the form deletion lifecycle

#### Scenario: FusionRun contains aggregation tracker state
- **WHEN** aggregation runs
- **THEN** run.getTracker() SHALL return the active AggregationTracker
- **AND** run.setTracker(tracker) SHALL set the tracker for the current run

#### Scenario: FusionRun contains managed account processing phase state
- **WHEN** managed account processing is initialized
- **THEN** run.managedAccountProcessingState SHALL reflect the current state (`idle` or `initialized`)
- **AND** run.managedAccountProcessingStartedAt SHALL record the start timestamp
- **AND** run.managedAccountProcessingBatchSize SHALL record the batch size

### Requirement: FusionRun provides snapshot and restore for recording

FusionRun SHALL expose a `snapshot()` method that returns a complete serializable representation of the current state. It SHALL expose a `restore(snapshot)` method that reconstructs the state from a previously captured snapshot, enabling deterministic replay.

#### Scenario: Snapshot captures complete state
- **WHEN** run.snapshot() is called during a run
- **THEN** the returned snapshot SHALL contain: managedAccounts, managedAccountsAllById, fusionAccounts, identities, formDecisions, fusionIdentityDecisions, pendingCandidateIdentityIds, pendingReviewUrlsByReviewerId, pendingReviewUrlsByCandidateId, sourcesByName, currentRunNonMatchedKeysBySource, fusionBlends, autoAssignedIds, matchScoringMs, phaseTimings, formCounters, formDeleteQueue, managedAccountProcessing, trigramIndexBuilt
- **AND** the snapshot SHALL be JSON-serializable

#### Scenario: Restore reconstructs identical state
- **GIVEN** a snapshot captured from a run
- **WHEN** a new FusionRun.restore(snapshot) is called
- **THEN** all maps, sets, and scalar values SHALL match the captured state
- **AND** services operating on the restored run SHALL see the same data

### Requirement: FusionRun is the only owner of managed source inventory maps

FusionRun SHALL be the single source of truth for source inventory maps such as `sourcesByName`, managed account indexes, and `managedAccountsAllById`. Other services SHALL NOT maintain parallel copies of these maps that must be hand-synchronized.

#### Scenario: Matching reads source info from FusionRun
- **WHEN** `MatchOutcomeDispatcher` looks up source information for an account
- **THEN** it SHALL read from `run.sourcesByName` and not from a `SourceService`-local copy

#### Scenario: SourceService writes to FusionRun
- **WHEN** `SourceService` loads managed source accounts and source metadata
- **THEN** it SHALL write the source metadata into `run.sourcesByName` rather than storing it internally
- **AND** it SHALL write all managed accounts into `run.managedAccountsAllById` rather than maintaining a service-local copy

#### Scenario: managedAccountsAllById has a single canonical location
- **WHEN** any service needs access to all managed accounts by ID
- **THEN** it SHALL read from `run.managedAccountsAllById`
- **AND** no service-local `managedAccountsAllById` SHALL exist in any service

### Requirement: Tracker and managed account processing state live on FusionRun

FusionRun SHALL own the AggregationTracker and managed account processing state machine. FusionService SHALL delegate tracker and phase state access to FusionRun rather than holding them as service-instance fields.

#### Scenario: FusionService sets tracker on FusionRun
- **WHEN** FusionService initializes aggregation
- **THEN** it SHALL call `run.setTracker(tracker)` rather than storing `this._tracker`

#### Scenario: Sub-components access tracker via FusionRun
- **WHEN** a managed account processor needs the aggregation tracker
- **THEN** it SHALL call `run.getTracker()` rather than receiving a tracker via closure from FusionService

#### Scenario: Managed account processing state lives on FusionRun
- **WHEN** FusionService initializes managed account processing
- **THEN** it SHALL call `run.startManagedAccountProcessing(batchSize)` rather than setting `this._managedAccountProcessingState`
- **AND** upon completion it SHALL call `run.resetManagedAccountProcessing()` rather than setting `this._managedAccountProcessingState = 'idle'`

### Requirement: Trigram index and normalization caches live on FusionRun

FusionRun SHALL own the trigram blocking index and normalization caches currently on MatchingService. MatchingService SHALL access these via `run` rather than `this`.

#### Scenario: MatchingService builds trigram index on FusionRun
- **WHEN** MatchingService.buildTrigramIndex is called
- **THEN** it SHALL populate `run.trigramIndexByAttribute` and `run.indexedMandatoryAttributes`
- **AND** it SHALL NOT access `this.trigramIndexByAttribute` or `this.indexedMandatoryAttributes`

#### Scenario: MatchingService uses normalization caches from FusionRun
- **WHEN** MatchingService normalizes a string value for scoring
- **THEN** it SHALL read and write `run.normalizedCache` and `run.nameNormalizedCache`
- **AND** it SHALL NOT access `this.normalizedCache` or `this.nameNormalizedCache`

### Requirement: Form counters and delete queue live on FusionRun

FusionRun SHALL own form processing counters and the form deletion queue state. FormService SHALL read and write these via `run` rather than `this`.

#### Scenario: FormService increments counters on FusionRun
- **WHEN** FormService creates a form
- **THEN** it SHALL call `run.incrementFormsCreated()` rather than `this._formsCreated++`

#### Scenario: FormService manages delete queue via FusionRun
- **WHEN** FormService queues a form for deletion
- **THEN** it SHALL call `run.queueFormForDeletion(formDefId)` rather than `this.formsToDelete.add(formDefId)`

#### Scenario: FormService resets all form state via FusionRun
- **WHEN** FormService.resetFormDataState is called
- **THEN** it SHALL call `run.resetFormState()` which resets both counters and delete queue
