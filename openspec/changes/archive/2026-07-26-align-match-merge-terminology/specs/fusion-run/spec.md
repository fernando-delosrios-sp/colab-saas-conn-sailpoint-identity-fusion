## MODIFIED Requirements

### Requirement: FusionRun holds all run-scoped data

FusionRun SHALL contain maps, sets, and state fields for all data loaded and processed during an operation run: managed accounts, identities, Fusion accounts, Fusion identities, source information, form decisions, form counters, form delete queue, matching state, aggregation tracker, trigram index, normalization caches, managed account processing state machine, analysis recording, and timing metrics.

#### Scenario: FusionRun contains managed account state
- **WHEN** aggregation loads managed accounts
- **THEN** run.managedAccountsById SHALL contain all loaded managed accounts initially
- **AND** run.managedAccountsByIdentityId SHALL contain identity-grouped accounts
- **AND** run.managedAccountInventory SHALL contain lightweight metadata for every loaded key (populated by `setManagedAccount`)

#### Scenario: FusionRun contains fusion processing state
- **WHEN** fusion accounts are processed
- **THEN** run.fusionAccountMap SHALL contain all fusion accounts
- **AND** run.fusionIdentityMap SHALL contain identity-linked fusion accounts
- **AND** run.autoMergedIdentityIds SHALL track automatically merged identities
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
- **THEN** the returned snapshot SHALL contain: managedAccounts, managedAccountInventory, fusionAccounts, identities, formDecisions, fusionIdentityDecisions, pendingCandidateIdentityIds, pendingReviewUrlsByReviewerId, pendingReviewUrlsByCandidateId, sourcesByName, currentRunNonMatchedKeysBySource, fusionBlends, autoMergedIds, matchScoringMs, phaseTimings, formCounters, formDeleteQueue, managedAccountProcessing, trigramIndexBuilt
- **AND** the snapshot SHALL be JSON-serializable

#### Scenario: Restore reconstructs identical state
- **GIVEN** a snapshot captured from a run
- **WHEN** a new FusionRun.restore(snapshot) is called
- **THEN** all maps, sets, and scalar values SHALL match the captured state
- **AND** services operating on the restored run SHALL see the same data

### Requirement: FusionRun encapsulates scoring state

FusionRun SHALL expose methods for scoring state mutations: markAutoMerged, isAutoMerged, and resetScoringState. External code SHALL NOT directly mutate autoMergedIdentityIds or matchScoringMs.

#### Scenario: Recording an auto-assignment
- **WHEN** the match engine automatically merges an identity
- **THEN** it SHALL call run.markAutoMerged(identityId) rather than run.autoMergedIdentityIds.add(identityId)

#### Scenario: Resetting scoring state for a new run
- **WHEN** a new managed account processing phase starts
- **THEN** the orchestrator SHALL call run.resetScoringState() rather than manually clearing autoMergedIdentityIds and resetting matchScoringMs
