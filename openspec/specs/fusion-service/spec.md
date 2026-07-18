# fusion-service Spec

## Purpose

The fusion service (`src/services/fusionService/`) is the orchestrator for the Fusion account model: it builds `FusionAccount` instances from managed sources and identity data, blends new managed accounts into existing Fusion accounts, and produces the `FusionReportAccount` / `FusionReportBlend` report records used by the connector's account and report operations. This spec defines the contract for how a managed account becomes a Fusion account, the blending semantics, and the report-side vocabulary that downstream operations consume.
## Requirements
### Requirement: Account Blending Terminology
The system SHALL use the term "blending" to refer to the process of merging a managed account into a Fusion account.

#### Scenario: Blended managed account history log
- **WHEN** a managed account is absorbed into a Fusion account
- **THEN** the Fusion account history SHALL log "Blended managed account [Account Name] ([Source Name])"

### Requirement: Report Tracking of Account Blends
The system SHALL track blending events during processing to populate the aggregation report payload.

#### Scenario: Recording a blending event
- **WHEN** a managed account is successfully set/absorbed into a Fusion account
- **AND** history recording is not skipped for that account key
- **THEN** the system SHALL record a blending event containing the target Fusion account name, link, and the blended account's name and source

### Requirement: missing-accounts attribute MUST restore uncorrelated account references

When a Fusion account is reconstructed from persisted platform attributes, the `missing-accounts` collection MUST be restored into the internal missing-account reference set. It MUST NOT be loaded from the correlated `accounts` collection.

#### Scenario: persisted missing-accounts are restored as missing references
- **GIVEN** a persisted Fusion account with `missing-accounts: ["src-a::user-1"]` and `accounts: ["src-a::user-2"]`
- **WHEN** the account is initialized via `FusionAccount.fromFusionAccount`
- **THEN** the missing-account reference set contains `"src-a::user-1"`
- **AND** the missing-account reference set does not contain `"src-a::user-2"`

#### Scenario: correlated accounts are not restored as missing references
- **GIVEN** a persisted Fusion account with `accounts: ["src-a::user-2"]` and no `missing-accounts` attribute
- **WHEN** the account is initialized via `FusionAccount.fromFusionAccount`
- **THEN** the missing-account reference set is empty
- **AND** the previous correlated account reference set contains `"src-a::user-2"`

### Requirement: Factory methods initialize core state consistently

Each static factory method MUST produce a `FusionAccount` whose core scalar fields (`type`, `nativeIdentity`, `name`, `sourceName`, `disabled`, `needsRefresh`, `identityInfo`, `iscAccountId`, `modified`) are set from the provided input.

Feature: Fusion account construction
Rule: `FusionAccount` factory methods initialize core scalar state from their inputs.

#### Scenario: fromIdentity initializes identity-origin core state
- **GIVEN** an `IdentityDocument` with `id: 'id-1'`, `name: 'Jane Doe'`, `disabled: false`
- **WHEN** `FusionAccount.fromIdentity(identity)` is called
- **THEN** the resulting account has `type` of `'identity'`
- **AND** `nativeIdentity` is `'id-1'`
- **AND** `name` is `'Jane Doe'`
- **AND** `sourceName` is `'Identities'`
- **AND** `disabled` is `false`

#### Scenario: fromManagedAccount initializes managed-origin core state
- **GIVEN** an SDK `Account` with `sourceId: 'src-a'`, `nativeIdentity: 'nat-1'`, `sourceName: 'Source A'`, `id: 'isc-1'`
- **WHEN** `FusionAccount.fromManagedAccount(account)` is called
- **THEN** the resulting account has `type` of `'managed'`
- **AND** `nativeIdentity` is `'src-a::nat-1'`
- **AND** `sourceName` is `'Source A'`
- **AND** `iscAccountId` is `'isc-1'`

### Requirement: fromFusionAccount restores persisted collection state

`FusionAccount.fromFusionAccount` MUST restore the internal collection sets (`_missingAccountIds`, `_reviews`, `_statuses`, `_actions`, `previousAccountIds`) and history from the persisted account attributes.

Feature: Fusion account construction
Rule: `fromFusionAccount` reconstructs internal collection and history state from persisted attributes.

#### Scenario: persisted accounts restore the previous account reference set
- **GIVEN** a persisted fusion account whose `attributes.accounts` contains `'src-a::correlated-1'`
- **WHEN** `FusionAccount.fromFusionAccount(account)` is called
- **THEN** `previousAccountIds` contains `'src-a::correlated-1'`

#### Scenario: persisted history restores the internal history trail
- **GIVEN** a persisted fusion account whose `attributes.history` contains `['[2026-01-01] event']`
- **WHEN** `FusionAccount.fromFusionAccount(account)` is called
- **THEN** `history` contains `'[2026-01-01] event'`

### Requirement: Identity-origin accounts carry baseline status

Accounts created from an identity OR reconstructed from a persisted identity-origin record MUST have the `baseline` status and the `Identities` source.

Feature: Fusion account construction
Rule: Identity-origin fusion accounts always carry the `baseline` status marker and `Identities` source.

#### Scenario: fromIdentity sets baseline status
- **GIVEN** an `IdentityDocument` with `id: 'id-1'`
- **WHEN** `FusionAccount.fromIdentity(identity)` is called
- **THEN** `statuses` contains `'baseline'`
- **AND** `sources` contains `'Identities'`

#### Scenario: fromFusionAccount re-asserts missing baseline for identity-origin records
- **GIVEN** a persisted identity-origin fusion account with `attributes.originSource: 'Identities'` and empty `attributes.statuses`
- **WHEN** `FusionAccount.fromFusionAccount(account)` is called
- **THEN** `statuses` contains `'baseline'`
- **AND** `sources` contains `'Identities'`

### Requirement: Managed-origin creation paths set uncorrelated state

Accounts created from an uncorrelated managed account or a fusion decision MUST be marked as uncorrelated and track the managed account key as missing.

Feature: Fusion account construction
Rule: Managed-origin creation paths initialize uncorrelated state.

#### Scenario: fromManagedAccount marks the account uncorrelated
- **GIVEN** an SDK `Account` with `sourceId: 'src-a'`, `nativeIdentity: 'nat-1'`
- **WHEN** `FusionAccount.fromManagedAccount(account)` is called
- **THEN** `statuses` contains `'uncorrelated'`
- **AND** `missingAccountIds` contains `'src-a::nat-1'`
- **AND** `needsReset` is `true`

#### Scenario: fromFusionDecision marks the account uncorrelated
- **GIVEN** a `FusionDecision` whose account has `sourceId: 'src-b'`, `nativeIdentity: 'nat-2'`
- **WHEN** `FusionAccount.fromFusionDecision(decision)` is called
- **THEN** `statuses` contains `'uncorrelated'`
- **AND** `missingAccountIds` contains `'src-b::nat-2'`

### Requirement: fromFusionAccount restores identity linkage from persisted attributes

When the SDK `Account` does not expose `identityId` directly, `fromFusionAccount` MUST recover it from `attributes.identityId` and fold it into the account's `IdentityInfo`.

Feature: Fusion account construction
Rule: Persisted `identityId` attribute restores the account's identity linkage.

#### Scenario: identityId attribute restores identity linkage
- **GIVEN** a persisted fusion account with no top-level `identityId` and `attributes.identityId: 'identity-1'`
- **WHEN** `FusionAccount.fromFusionAccount(account)` is called
- **THEN** `identityId` is `'identity-1'`
- **AND** `identityIdAttribute` is `'identity-1'`

#### Scenario: whitespace-only identityId attribute is ignored
- **GIVEN** a persisted fusion account with `attributes.identityId: '   '`
- **WHEN** `FusionAccount.fromFusionAccount(account)` is called
- **THEN** `identityId` is undefined

### Requirement: FusionAccountState SHALL own all mutable data fields

The `FusionAccountState` class MUST hold all mutable data fields (core identity, basic info, state flags, collections, attribute bag, timestamps) as public properties with appropriate default values. Read-only configuration fields (`sourceConfigNamesSet`, `fusionAccountRefreshThresholdInSeconds`, `maxHistoryMessages`) MUST be set via constructor and marked `readonly`.

#### Scenario: State object initialized with config

- **WHEN** `FusionAccountState` is constructed with config containing `sourceConfigNamesSet`, `fusionAccountRefreshThresholdInSeconds`, and `maxHistoryMessages`
- **THEN** read-only config fields are set and mutable fields have their default values (empty sets, empty arrays, false flags, empty strings)

### Requirement: FusionAccountState SHALL serialize collections to the attribute bag

The `syncCollectionAttributesToBag()` method MUST copy `accounts`, `missing-accounts`, `statuses`, `actions`, `reviews`, and `sources` from their respective `Set` collections into `attributeBag.current` and `attributeBag.previous`.

#### Scenario: Sync copies collection data to attribute bag

- **WHEN** `syncCollectionAttributesToBag()` is called after adding entries to collection sets
- **THEN** `attributeBag.current` contains each collection as an array representation of the set

### Requirement: Rule modules SHALL operate on FusionAccountState as functions

Each rule module (`constructionRules`, `layerRules`, `statusRules`, `actionRules`, `reviewRules`, `correlationRules`, `historyRules`) MUST export standalone functions that accept `FusionAccountState` as a parameter and mutate it. Rule functions SHALL NOT have side effects outside the passed state object.

#### Scenario: Rule function mutates only the provided state

- **WHEN** a rule function such as `addStatus(state, "matched")` is called
- **THEN** only `state.statuses` is modified — no other state object is affected

### Requirement: FusionAccount facade SHALL delegate all operations to state and rules

`FusionAccount` MUST contain only a private `state` field, static factory methods delegating to construction rules, public accessors delegating to `this.state`, and public mutators delegating to the appropriate rule module. No private helpers or internal logic SHALL remain in `FusionAccount.ts`.

#### Scenario: Factory method delegates to construction rules

- **WHEN** `FusionAccount.fromIdentity(identity)` is called
- **THEN** a new `FusionAccount` is constructed and `buildFromIdentity` is called on its `state`

#### Scenario: Mutator delegates to rule module

- **WHEN** `fusionAccount.addStatus("test-status")` is called
- **THEN** `FusionAccountStatusRules.addStatus` is invoked with `fusionAccount.state` and the status

#### Scenario: Accessor reads from state

- **WHEN** `fusionAccount.email` is accessed after `state.email` is set to `"test@example.com"`
- **THEN** the getter returns `"test@example.com"`

### Requirement: FusionService SHALL own a CandidateRegistry collaborator
The `FusionService` constructor MUST instantiate a `CandidateRegistry` with the fusion account map, sources-by-name map, and log. The registry SHALL be the single source of truth for per-source unmatched candidate registration and query during the two-pass managed account analysis lifecycle.

#### Scenario: Registry is wired in constructor
- **WHEN** `FusionService` is constructed
- **THEN** a `CandidateRegistry` instance is created with `fusionAccountMap`, `sourcesByName`, and `log`
- **AND** the instance is assigned to `this.candidateRegistry`

### Requirement: CandidateRegistry SHALL register accounts keyed by source
The `CandidateRegistry.register` method MUST add the given `FusionAccount`'s managed key to the candidate set for that account's source. Only accounts from authoritative sources with deferred matching enabled SHALL be registered.

#### Scenario: Deferred-enabled authoritative account is registered
- **WHEN** `register` is called with a `FusionAccount` whose source is authoritative and deferred-matching-enabled
- **THEN** the account's managed key is added to the candidate set for that source

#### Scenario: Non-authoritative account is not registered
- **WHEN** `register` is called with a `FusionAccount` whose source type is `Record`
- **THEN** the account is NOT added to any candidate set

#### Scenario: Account with no managed key is not registered
- **WHEN** `register` is called with a `FusionAccount` whose `managedKey` is undefined
- **THEN** the account is NOT added to any candidate set

### Requirement: CandidateRegistry SHALL query candidates per source
The `CandidateRegistry.queryForSource` method MUST return an `Iterable<FusionAccount>` containing only candidates registered for the given source name.

#### Scenario: Candidates are returned for the requested source
- **WHEN** `queryForSource` is called with source name `"Source A"`
- **THEN** only candidates registered with source key `"Source A"` are yielded

#### Scenario: No candidates returns empty iterable
- **WHEN** `queryForSource` is called with a source name that has no registered candidates
- **THEN** an empty iterable is returned (no errors)

### Requirement: CandidateRegistry SHALL be clearable for initialization
The `CandidateRegistry.clear` method MUST reset all registered candidates. FusionService MUST call `clear` during `initializeManagedAccountProcessing`.

#### Scenario: Clear is called during initialization
- **WHEN** `initializeManagedAccountProcessing` runs
- **THEN** `candidateRegistry.clear()` is called, resetting all candidate sets

### Requirement: FusionService SHALL own a ManagedAccountPassRunner collaborator
The `FusionService` constructor MUST instantiate a `ManagedAccountPassRunner` with a dependency-inverted state interface. The runner SHALL NOT reference `FusionService` directly.

#### Scenario: Runner is wired in constructor
- **WHEN** `FusionService` is constructed
- **THEN** a `ManagedAccountPassRunner` instance is created with a `ManagedAccountPassRunnerState` containing `config`, `log`, `managedAccountAnalyzer`, `candidateRegistry`, and `processAccount`
- **AND** the runner has no direct reference to `FusionService`

### Requirement: ManagedAccountPassRunner SHALL execute two-pass analysis
The runner's `execute` method MUST: (Pass 1) run identity-phase analysis on all accounts in parallel batches, classify results as identity-match, deferred-pending, or non-match, and register deferred-pending candidates; (Pass 2) run deferred-phase analysis on all pending accounts in parallel batches, classifying results as deferred-match or non-match.

#### Scenario: Identity match produces identity-match result
- **WHEN** Pass 1 identity scoring produces `hasIdentityBackedMatches: true`
- **THEN** the runner emits a result with resolution `identity-match`

#### Scenario: Deferred-enabled unmatched account is queued for Pass 2
- **WHEN** an account from a deferred-matching-enabled authoritative source has no identity match after Pass 1
- **THEN** the account is registered as a candidate via `candidateRegistry.register`
- **AND** the account is queued for Pass 2

#### Scenario: Non-deferred unmatched account produces non-match
- **WHEN** an account from a source WITHOUT deferred matching has no identity match after Pass 1
- **THEN** the result has resolution `non-match`

#### Scenario: Peer match in Pass 2 produces deferred-match result
- **WHEN** Pass 2 deferred scoring produces a peer match with candidate type `NewUnmatched`
- **THEN** the result has resolution `deferred-match`

#### Scenario: No peer match in Pass 2 produces non-match result
- **WHEN** Pass 2 deferred scoring produces no match
- **THEN** the result has resolution `non-match`

#### Scenario: Pass 2 runs in parallel batches
- **WHEN** Pass 2 has 50 pending accounts and batch size is 10
- **THEN** deferred scoring runs in 5 parallel batches of 10
- **AND** each account scores against per-source candidates registered during Pass 1

### Requirement: ManagedAccountPassRunner SHALL return structured results without side effects
The `execute` method MUST NOT call `recordAnalysis` or any dispatch handler. It MUST return an array of `ManagedAccountPassResult` objects, each containing the `ManagedAccountAnalysisContext` and a `resolution` string.

#### Scenario: Runner returns clean results
- **WHEN** `execute` completes
- **THEN** an array of `ManagedAccountPassResult` objects is returned
- **AND** no calls to `recordAnalysis`, `handleIdentityBackedMatch`, `handleDeferredMatch`, or `handleNonMatch` are made

### Requirement: ManagedAccountPassRunner SHALL report progress during execution
The runner MUST log progress at intervals matching current behavior (first account, every log-every-N accounts, final account) including processed count and elapsed time.

#### Scenario: Progress is logged at intervals
- **WHEN** `execute` processes 100 accounts with log-every 20
- **THEN** progress is logged at accounts 1, 20, 40, 60, 80, 100

### Requirement: FusionService SHALL delegate uncorrelated pass to the runner
`runUncorrelatedManagedAccountPass` MUST call `runner.execute()`, iterate results, call `recordAnalysis` once per result, and dispatch to the appropriate handler via a flat switch on resolution.

#### Scenario: Runner is called with queued accounts
- **WHEN** `runUncorrelatedManagedAccountPass` is called
- **THEN** `passRunner.execute` is invoked with queued accounts, batch size, and start time

#### Scenario: Each result is recorded and dispatched
- **WHEN** the runner returns results
- **THEN** `recordAnalysis` is called once for each result
- **AND** `identity-match` dispatches to `handleIdentityBackedMatch`
- **AND** `deferred-match` dispatches to `handleDeferredMatch`
- **AND** `non-match` dispatches to `handleNonMatch`

### Requirement: FusionService SHALL use runner for single-account analysis in processManagedAccount
`processManagedAccount` for uncorrelated accounts MUST call the runner with a single-account batch. The `analyzeManagedAccount` method SHALL be removed. The `completeManagedAccountFromAnalysis` method SHALL be removed.

#### Scenario: Uncorrelated account processed via runner
- **WHEN** `processManagedAccount` receives an uncorrelated account (`uncorrelated === true`)
- **THEN** `passRunner.execute` is called with `[account]` and batch size 1
- **AND** the returned result is dispatched via `handleIdentityBackedMatch`, `handleDeferredMatch`, or `handleNonMatch`

### Requirement: FusionService SHALL call recordAnalysis exactly once per account
`recordAnalysis` SHALL be called exactly once for each account's analysis, after the runner returns. No account SHALL be recorded more than once during the managed account processing pass.

#### Scenario: Record is called once per result
- **WHEN** the runner returns N results
- **THEN** `analysisRecorder.recordAnalysis` is called exactly N times
- **AND** no account's analysis is recorded more than once

