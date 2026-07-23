## ADDED Requirements

### Requirement: FusionRun maintains a lightweight managed account inventory

FusionRun SHALL maintain `managedAccountInventory`, a map of managed account keys to `ManagedAccountInfo` records containing at minimum `id`, `name`, `sourceName`, and optionally `sourceId` and `nativeIdentity`. The inventory SHALL be populated when `setManagedAccount` is called and SHALL retain every key loaded during the run until explicitly cleared, independent of work-queue depletion via `claimAccount`.

#### Scenario: Inventory retains keys after work queue claim
- **GIVEN** a managed account key loaded via `setManagedAccount`
- **WHEN** `claimAccount` removes the key from `managedAccountsById`
- **THEN** `hasManagedAccount(key)` SHALL still return true
- **AND** `getManagedAccountInfo(key)` SHALL return the cached metadata

#### Scenario: Inventory is populated in setManagedAccount only
- **WHEN** SourceService loads a managed account
- **THEN** it SHALL call `run.setManagedAccount(key, account)` once
- **AND** FusionRun SHALL update both the work queue and inventory in that method
- **AND** no caller SHALL write to a separate full-account snapshot map

### Requirement: FusionRun exposes managed account inventory accessors

FusionRun SHALL expose `hasManagedAccount(key: string): boolean`, `getManagedAccountInfo(key: string): ManagedAccountInfo | undefined`, and `clearManagedAccountState(): void` for managed account lifecycle operations. External code SHALL use these accessors instead of reading a full-account snapshot map.

#### Scenario: Form service checks account existence via accessor
- **WHEN** FormService determines whether a managed account still exists in the run
- **THEN** it SHALL call `run.hasManagedAccount(accountId)`
- **AND** it SHALL NOT read from `managedAccountsAllById`

#### Scenario: Report service resolves display metadata via accessor
- **WHEN** ReportService resolves a managed account display name or ISC account id
- **THEN** it SHALL call `run.getManagedAccountInfo(managedAccountKey)`
- **AND** it SHALL NOT read from `managedAccountsAllById`

#### Scenario: Output phase clears managed account state
- **WHEN** SourceService clears managed accounts at output phase
- **THEN** it SHALL call `run.clearManagedAccountState()`
- **AND** both the work queue and inventory SHALL be empty afterward

---

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
- **THEN** the returned snapshot SHALL contain: managedAccounts, managedAccountInventory, fusionAccounts, identities, formDecisions, fusionIdentityDecisions, pendingCandidateIdentityIds, pendingReviewUrlsByReviewerId, pendingReviewUrlsByCandidateId, sourcesByName, currentRunNonMatchedKeysBySource, fusionBlends, autoAssignedIds, matchScoringMs, phaseTimings, formCounters, formDeleteQueue, managedAccountProcessing, trigramIndexBuilt
- **AND** the snapshot SHALL be JSON-serializable

#### Scenario: Restore reconstructs identical state
- **GIVEN** a snapshot captured from a run
- **WHEN** a new FusionRun.restore(snapshot) is called
- **THEN** all maps, sets, and scalar values SHALL match the captured state
- **AND** services operating on the restored run SHALL see the same data

### Requirement: FusionRun is the only owner of managed source inventory maps

FusionRun SHALL be the single source of truth for source inventory maps such as `sourcesByName`, managed account indexes, and `managedAccountInventory`. Other services SHALL NOT maintain parallel copies of these maps that must be hand-synchronized.

#### Scenario: Matching reads source info from FusionRun
- **WHEN** `MatchOutcomeDispatcher` looks up source information for an account
- **THEN** it SHALL read from `run.sourcesByName` and not from a `SourceService`-local copy

#### Scenario: SourceService writes to FusionRun
- **WHEN** `SourceService` loads managed source accounts and source metadata
- **THEN** it SHALL write the source metadata into `run.sourcesByName` rather than storing it internally
- **AND** it SHALL write each managed account via `run.setManagedAccount` rather than maintaining a service-local full-account snapshot

#### Scenario: Managed account inventory has a single canonical location
- **WHEN** any service needs managed account metadata after work-queue depletion
- **THEN** it SHALL call `run.getManagedAccountInfo(key)` or `run.hasManagedAccount(key)`
- **AND** no service-local full-account snapshot map SHALL exist in any service
