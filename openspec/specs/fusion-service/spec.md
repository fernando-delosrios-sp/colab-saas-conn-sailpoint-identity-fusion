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

### Requirement: FusionService delegates matching to MatchingService

FusionService SHALL delegate all managed account matching to MatchingService. FusionService SHALL NOT directly call scoring methods, manage candidate registries, or orchestrate matching sweeps.

#### Scenario: Uncorrelated managed accounts delegated to MatchingService
- **WHEN** processUncorrelatedManagedAccounts is called
- **THEN** MatchingService.processUncorrelatedManagedAccounts SHALL be invoked with FusionRun
- **AND** FusionService SHALL NOT call ManagedAccountMatchingRunner directly

#### Scenario: Process phase delegates matching
- **WHEN** the process phase runs in the pipeline
- **THEN** MatchingService SHALL handle all match sweep orchestration
- **AND** FusionService SHALL only call MatchingService entry points

### Requirement: FusionService receives state via FusionRun

FusionService SHALL access all shared run state through FusionRun at construction time. Internal state previously held on FusionService (`_tracker`, `_managedAccountProcessingState`, `_managedAccountProcessingStartedAt`, `_managedAccountProcessingBatchSize`) SHALL live on FusionRun. Pass-through getters (`sourcesByName`, `_reviewersBySourceId`, `_sourcesWithoutReviewers`, `autoAssignedIdentityIds`) SHALL NOT exist — callers SHALL access FusionRun directly.

#### Scenario: FusionService reads fusion accounts from FusionRun
- **WHEN** FusionService needs to iterate fusion accounts
- **THEN** it SHALL read from run.fusionAccountMap, not this.fusionAccountMap

#### Scenario: FusionService reads sources by name from FusionRun
- **WHEN** FusionService needs to resolve a source by name
- **THEN** it SHALL read from run.sourcesByName
- **AND** there SHALL be no `sourcesByName` getter on FusionService delegating to `run`

#### Scenario: FusionService delegates tracker to FusionRun
- **WHEN** FusionService initializes aggregation tracking
- **THEN** it SHALL call `run.setTracker(tracker)` rather than storing `this._tracker`
- **AND** sub-components SHALL access the tracker via `run.getTracker()`

#### Scenario: FusionService delegates processing phase state to FusionRun
- **WHEN** FusionService manages the managed account processing lifecycle
- **THEN** it SHALL call `run.startManagedAccountProcessing()` and `run.resetManagedAccountProcessing()`
- **AND** there SHALL be no `_managedAccountProcessingState` field on FusionService

### Requirement: Processors receive explicit state and service dependencies

IdentityProcessor, DecisionProcessor, and CorrelationManager SHALL receive their dependencies explicitly rather than through a single FusionService reference, and SHALL delegate account assembly recipe steps to the `AccountAssembly` service.

#### Scenario: IdentityProcessor reads state from FusionRun
- **WHEN** IdentityProcessor needs to access fusionIdentityMap or fusionAccountMap
- **THEN** it SHALL read from its own `run` parameter, not through fusionService getters
- **AND** it SHALL use `AccountAssembly` for account assembly operations.

#### Scenario: DecisionProcessor reads state from FusionRun
- **WHEN** DecisionProcessor needs to iterate fusionAccountMap or fusionIdentityMap
- **THEN** it SHALL read from its own `run` parameter, not through fusionService getters
- **AND** it SHALL access sourcesByName through run and use `AccountAssembly` for account assembly.

#### Scenario: CorrelationManager receives explicit service dependencies
- **WHEN** CorrelationManager is constructed
- **THEN** it SHALL receive IdentityService, SourceService, and an isAggregationMode callback
- **AND** it SHALL NOT receive a FusionService reference

### Requirement: FusionService retains pipeline orchestration

FusionService SHALL retain responsibility for pipeline phase coordination (setup, fetch, refresh, process, output), reviewer management, identity processing delegation, ISC account output, and report generation.

#### Scenario: Pipeline phases still orchestrated by FusionService
- **WHEN** the aggregation pipeline runs
- **THEN** phase transitions SHALL be coordinated by FusionService
- **AND** MappingService, DefinitionService, and MatchingService SHALL be invoked at the appropriate phase boundaries

### Requirement: FusionService avoids redundant delegation wrappers

FusionService SHALL NOT wrap outcome handler methods with single-line delegation methods. Internal references to outcome handlers SHALL directly access `this.outcomeHandler` to improve readability and maintainability.

#### Scenario: Calling outcome handlers directly
- **WHEN** FusionService evaluates match outcomes
- **THEN** it calls methods directly on `this.outcomeHandler` (e.g. `this.outcomeHandler.handleIdentityMatch`) rather than proxying through `this.handleIdentityMatch`

### Requirement: Unique attributes SHALL be generated Just-In-Time during output streaming
The system SHALL NOT eagerly filter and output Fusion accounts prior to the final output phase to bypass memory constraints. Instead, the system SHALL stream all Fusion accounts uniformly during the final output phase, evaluating and generating unique attributes Just-In-Time immediately prior to serialization. 

#### Scenario: JIT Unique Attribute Generation prevents memory accumulation
- **WHEN** the aggregation output phase iterates through Fusion accounts
- **AND** a Fusion account requires unique attribute generation
- **THEN** the system SHALL generate the unique attributes exactly before serializing the account
- **AND** the system SHALL immediately remove the serialized account from memory

#### Scenario: Single account reads preserve unique attribute state
- **WHEN** a single Fusion account is processed outside of an aggregation context (e.g. account read, dry-run)
- **THEN** the JIT output hook SHALL NOT advance unique attribute counters inappropriately

### Requirement: FusionService delegates mode-gate logic to AccountAssembly

FusionService SHALL delegate aggregation-mode detection (`isAggregationAccountListMode`) and prune-delete gating (`shouldPruneDeletedManagedAccounts`) to the injected `AccountAssembly` collaborator. FusionService SHALL NOT own its own copies of these methods.

#### Scenario: Aggregation mode checked via AccountAssembly
- **WHEN** FusionService needs to determine if the current operation is an aggregation account-list run
- **THEN** it SHALL call `this.accountAssembly.isAggregationAccountListMode()`
- **AND** the method definition SHALL NOT exist on FusionService

#### Scenario: Prune-delete gating checked via AccountAssembly
- **WHEN** FusionService needs to determine whether to prune deleted managed accounts
- **THEN** it SHALL call `this.accountAssembly.shouldPruneDeletedManagedAccounts()`
- **AND** the method definition SHALL NOT exist on FusionService

### Requirement: DecisionProcessor delegates mode-gate logic to AccountAssembly

DecisionProcessor SHALL delegate aggregation-mode detection to the injected `AccountAssembly` collaborator. DecisionProcessor SHALL NOT own its own copy of `isAggregationAccountListMode` nor store `commandType` and `operationContext` solely to power a local copy.

#### Scenario: Aggregation mode checked via AccountAssembly
- **WHEN** DecisionProcessor needs to determine if the current operation is an aggregation run
- **THEN** it SHALL call `this.deps.accountAssembly.isAggregationAccountListMode()`
- **AND** `commandType` and `operationContext` SHALL NOT be constructor parameters on DecisionProcessor if their sole purpose was powering a local `isAggregationAccountListMode` copy

### Requirement: FusionService SHALL expose independent reset flag accessors

FusionService SHALL expose `isResetAccounts()` and `isResetForms()` methods that reflect the corresponding Developer Settings values loaded at construction time. The legacy `isReset()` method SHALL NOT be used.

#### Scenario: Flag accessors reflect config

- **GIVEN** FusionConfig with `resetAccounts: true` and `resetForms: false`
- **WHEN** FusionService is constructed
- **THEN** `isResetAccounts()` SHALL return `true`
- **AND** `isResetForms()` SHALL return `false`

### Requirement: FusionService SHALL auto-disable reset flags in source configuration

FusionService SHALL provide `disableResetAccounts()` and `disableResetForms()` methods that patch the fusion source connector attributes back to `false` after a reset flag is consumed. `disableResetAccounts()` SHALL patch both `/connectorAttributes/resetAccounts` and the legacy `/connectorAttributes/reset` path. `disableResetForms()` SHALL patch `/connectorAttributes/resetForms`.

#### Scenario: disableResetAccounts clears legacy key

- **WHEN** `disableResetAccounts()` is called on a persistent run
- **THEN** the connector SHALL patch `resetAccounts` to `false`
- **AND** the connector SHALL patch legacy `reset` to `false`

#### Scenario: disableResetForms clears forms flag only

- **WHEN** `disableResetForms()` is called on a persistent run
- **THEN** the connector SHALL patch `resetForms` to `false`
- **AND** the connector SHALL NOT modify `resetAccounts` or legacy `reset`

