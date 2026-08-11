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

### Requirement: FusionRun holds form processing state

FusionRun SHALL contain the following form-related per-run state: fusion identity decisions, pending candidate identity IDs, pending review URL mappings, form counters, and form deletion queue state.

#### Scenario: FusionRun contains form decision state
- **WHEN** form decisions are processed during an operation run
- **THEN** run.fusionIdentityDecisions SHALL contain the processed fusion identity decisions
- **AND** run.pendingCandidateIdentityIds SHALL contain candidate identity IDs with pending form instances
- **AND** run.pendingReviewUrlsByReviewerId SHALL map reviewer identity IDs to pending form instance URLs
- **AND** run.pendingReviewUrlsByCandidateId SHALL map candidate identity IDs to pending form instance URLs

#### Scenario: FusionRun contains form counters
- **WHEN** form processing runs
- **THEN** run.formsCreated, run.formInstancesCreated, run.formsFound, run.formInstancesFound, and run.answeredFormInstancesProcessed SHALL track form processing counters

#### Scenario: FusionRun contains form deletion queue
- **WHEN** form deletion is queued
- **THEN** run.formsToDelete, run.formDeleteQueue, run.queuedFormDeleteIds, run.pendingFormDeleteTasks, and run.activeFormDeleteWorkers SHALL track the form deletion lifecycle

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

FusionRun SHALL expose methods for scoring state mutations: markAutoMerged, isAutoMerged, and resetScoringState. External code SHALL NOT directly mutate autoMergedIdentityIds or matchScoringMs.

#### Scenario: Recording an automatic merge
- **WHEN** the match engine automatically merges an identity
- **THEN** it SHALL call run.markAutoMerged(identityId) rather than run.autoMergedIdentityIds.add(identityId)

#### Scenario: Resetting scoring state for a new run
- **WHEN** a new managed account processing phase starts
- **THEN** the orchestrator SHALL call run.resetScoringState() rather than manually clearing autoMergedIdentityIds and resetting matchScoringMs

### Requirement: RecordingService snapshots FusionRun directly

RecordingService SHALL call run.snapshot() to capture operation state, replacing the previous pattern of passing individual SourceService, IdentityService, and FormService references.

#### Scenario: RecordingService uses FusionRun snapshot
- **WHEN** RecordingService.startOperation is called
- **THEN** it SHALL receive FusionRun as a parameter
- **AND** it SHALL call run.snapshot() to capture the initial state
- **AND** it SHALL not access individual service internals

### Requirement: FusionRun holds operation execution mode state

FusionRun SHALL contain boolean properties denoting the global execution mode of the run, specifically whether the run is executing in record mode (`isRecordMode`). Record mode SHALL be derived from the resolved `config.recording.mode === 'record'` passed to the constructor. FusionRun SHALL NOT read `process.env.RECORD_MODE` directly. Environment variables `RECORD_MODE`, `RECORD_CHAIN_NAME`, and `VERBOSE_RECORDING` SHALL be consumed only by `resolveRecordingConfig()` during config load.

#### Scenario: FusionRun derives isRecordMode from resolved config
- **WHEN** `FusionRun` is constructed with `config.recording.mode = 'record'`
- **THEN** `isRecordMode` SHALL be `true`

#### Scenario: FusionRun is not in record mode when config mode is off
- **WHEN** `FusionRun` is constructed with `config.recording.mode = 'off'` regardless of `RECORD_MODE` env
- **THEN** `isRecordMode` SHALL be `false`

#### Scenario: FusionRun evaluates environment variables on initialization
- **WHEN** `FusionRun` is constructed
- **THEN** it SHALL NOT read `process.env.RECORD_MODE`
- **AND** `isRecordMode` SHALL reflect only the resolved `config.recording.mode` passed to the constructor

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

FusionRun SHALL expose domain verbs that hide the internal `analysisRecorder` from callers: `recordAnalysis(analysis)`, `trackFailed(fusionAccount, message)`, and any other recorder operations needed by the Match step. The `analysisRecorder` field SHALL be typed as `ManagedAccountAnalysisRecording` (port in `src/model/managedAccountAnalysisRecording.ts`). External pipeline code SHALL NOT directly reference `run.analysisRecorder`; `FusionService` MAY assign the concrete `ManagedAccountAnalysisRecorder` at construction time.

#### Scenario: Match module records a failed form
- **WHEN** `MatchOutcomeDispatcher` fails to create a review form
- **THEN** it SHALL call `run.trackFailed(fusionAccount, message)` rather than `run.analysisRecorder!.trackFailed(...)`

#### Scenario: No non-null assertions on recorder
- **WHEN** code reviews inspect Match-step code
- **THEN** there SHALL be no `run.analysisRecorder!` references

---

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

FusionRun SHALL own the trigram blocking index and normalization caches. MatchingService SHALL access these via `run` rather than `this`.

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

---

### Requirement: FusionRun maintains a lightweight managed account inventory

FusionRun SHALL maintain `managedAccountInventory`, a map of managed account keys to `ManagedAccountInfo` records containing at minimum `id`, `name`, `sourceName`, and optionally `sourceId`, `nativeIdentity`, and `identityId`. The inventory SHALL be populated when `setManagedAccount` is called and SHALL retain every key loaded during the run until explicitly cleared, independent of work-queue depletion via `claimAccount`.

#### Scenario: Inventory retains keys after work queue claim
- **GIVEN** a managed account key loaded via `setManagedAccount`
- **WHEN** `claimAccount` removes the key from `managedAccountsById`
- **THEN** `hasManagedAccount(key)` SHALL still return true
- **AND** `getManagedAccountInfo(key)` SHALL return the cached metadata

#### Scenario: Inventory stores identityId for claim fallback
- **WHEN** `setManagedAccount` registers a managed account with a non-empty `identityId`
- **THEN** `managedAccountInventory.get(key).identityId` SHALL equal that identity id
- **AND** FormService MAY use inventory `identityId` when invoking `claimAccount` after the work-queue entry was already removed in the same Fetch pass

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

### Requirement: Correlated identities are hydrated before the managed-account sweep

The connector SHALL hydrate identities correlated to **orphan correlated managed accounts** — managed source accounts that are correlated on the source (`uncorrelated === false`) and remain on the work queue after the refresh phase because they are not linked to any account key on a loaded Fusion row — before the correlated account sweep creates Fusion accounts from them. Hydration SHALL occur only for identities not already present in the run-scoped identity cache after the configured `identityScopeQuery` fetch. The connector SHALL NOT perform this hydration pass for managed accounts already linked to an existing Fusion row or for uncorrelated managed accounts.

For each orphan correlated managed account whose identity is hydrated, the connector SHALL apply the identity layer to the **new** Fusion account created from that managed account during the correlated account sweep, before `getISCAccount` serializes it, so the Fusion display-attribute override can consume the identity alias.

#### Scenario: Orphan correlated managed account with identity outside configured scope

- **WHEN** a managed source account is correlated on the source (`uncorrelated === false`)
- **AND** the account is not linked to any account key on a loaded Fusion row after refresh
- **AND** the account remains on the work queue with a non-empty `identityId`
- **AND** the correlated identity is not in the run-scoped identity cache after the configured `identityScopeQuery` fetch
- **THEN** the connector SHALL hydrate the identity by id before the correlated account sweep
- **AND** it SHALL apply the identity layer to the new Fusion account created from that managed account before `getISCAccount` serializes it

#### Scenario: Correlated managed account already linked to a Fusion row

- **WHEN** a managed source account is correlated on the source
- **AND** the account is linked to an account key on a loaded Fusion row during refresh
- **THEN** the connector SHALL NOT include that account's `identityId` in the orphan hydration pass

#### Scenario: Multiple orphan correlated accounts share the same identity

- **WHEN** two or more orphan correlated managed accounts on the work queue share the same `identityId`
- **THEN** the connector SHALL hydrate the identity once
- **AND** it SHALL apply the identity layer to each new Fusion account created from those managed accounts during the correlated sweep

#### Scenario: Correlated identity is protected

- **WHEN** a hydrated identity is flagged as `protected`
- **THEN** the connector SHALL NOT apply the identity layer to the corresponding new Fusion account

#### Scenario: No orphan correlated managed accounts on the work queue

- **WHEN** no work-queue managed account is correlated on the source and unlinked from loaded Fusion rows
- **THEN** the connector SHALL NOT perform any additional identity hydration for the correlated orphan pass

#### Scenario: Hydration query length is bounded

- **WHEN** the connector hydrates orphan correlated identities
- **THEN** it SHALL split the identity-id set into chunks of no more than 50 ids per query
- **AND** it SHALL execute the chunked queries in parallel with per-chunk error isolation

### Requirement: FusionRun tracks full-scan trigram fallback count

FusionRun SHALL expose a run-scoped numeric field `fullScanFallbackCount` initialized to zero at run start. MatchingService SHALL increment this field when trigram candidate blocking falls back to a full identity scan due to missing mandatory attribute values on a managed account.

#### Scenario: Counter starts at zero
- **WHEN** a new FusionRun is constructed for an operation
- **THEN** `fullScanFallbackCount` SHALL be `0`

#### Scenario: Counter accumulates across multiple accounts
- **GIVEN** two managed accounts each triggering full-scan fallback in the same run
- **WHEN** both are processed through `getCandidates`
- **THEN** `fullScanFallbackCount` SHALL equal `2`

### Requirement: FusionRun exposes non-copying fusion account iteration

FusionRun SHALL provide `fusionAccountsIterable()` returning an iterable over fusion accounts in `_fusionAccountMap` without allocating a new array. The existing `allFusionAccounts` getter SHALL continue to return a defensive copy for callers requiring a mutable array or spread composition.

#### Scenario: Iterable yields all fusion accounts
- **GIVEN** fusion accounts registered in `run.fusionAccountMap`
- **WHEN** a consumer iterates `run.fusionAccountsIterable()`
- **THEN** each registered fusion account SHALL be yielded exactly once

#### Scenario: Getter copy preserved for array consumers
- **WHEN** a caller accesses `run.allFusionAccounts`
- **THEN** a new array copy SHALL be returned
- **AND** mutating the returned array SHALL NOT mutate internal run state

### Requirement: FusionRun SHALL expose a run-scoped current time for replay simulation

FusionRun SHALL maintain an optional simulated current time in milliseconds. When simulated time is set, `currentTimeMs()` MUST return that value. When simulated time is not set, `currentTimeMs()` MUST return wall-clock `Date.now()`. `setSimulatedTime()` and `clearSimulatedTime()` MUST be the only mutators for simulated time on a run instance.

#### Scenario: Simulated time overrides wall clock

- **GIVEN** a FusionRun instance
- **WHEN** `setSimulatedTime('2026-07-31T08:24:12.899Z')` is called
- **THEN** `currentTimeMs()` MUST equal the parsed timestamp in milliseconds
- **AND** `currentTimeMs()` MUST NOT equal wall-clock time unless they coincide by chance

#### Scenario: Clearing simulated time restores wall clock

- **GIVEN** a FusionRun with simulated time set
- **WHEN** `clearSimulatedTime()` is called
- **THEN** subsequent `currentTimeMs()` MUST behave as wall-clock time

#### Scenario: Snapshot and restore preserve simulated time

- **GIVEN** a FusionRun with simulated time set
- **WHEN** `snapshot()` is called and the snapshot is restored on a new run
- **THEN** the restored run MUST preserve the simulated time value if present in the snapshot

