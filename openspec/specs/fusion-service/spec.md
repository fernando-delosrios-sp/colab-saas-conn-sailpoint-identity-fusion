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

### Requirement: FusionAccount SHALL expose collaborator sub-objects

`FusionAccount` MUST expose three readonly collaborator instances: `collections` (`FusionCollections`), `correlation` (`FusionCorrelation`), and `layers` (`FusionLayers`). `FusionAccount` MUST own core identity fields and the attribute bag. Collaborators MUST own the mutable slices described in ubiquitous language for each collaborator. `FusionAccountState` and `fusionAccountRules/*` MUST NOT exist.

#### Scenario: Collaborators are present on a new FusionAccount

- **GIVEN** a configured `FusionAccount`
- **WHEN** an account is constructed via a factory method
- **THEN** `account.collections`, `account.correlation`, and `account.layers` are defined
- **AND** each is an instance of the corresponding collaborator type

### Requirement: Callers SHALL use the collaborator API for account mutations

Production and test callers outside `FusionAccount` itself MUST mutate statuses, actions, reviews, account-id sets, history, matches, and correlation promises through `fusionAccount.collections` or `fusionAccount.correlation`. `FusionAccount` MUST NOT expose flat 1:1 pass-through mutators for those concerns (for example `addStatus` that only forwards to `collections.statuses.add`). Layer enrichment that must bind the attribute bag and identity fields MAY remain as orchestration methods on `FusionAccount` (for example `addIdentityLayer`, `addManagedAccountLayer`) that delegate to `FusionLayers`.

#### Scenario: Status mutation goes through collections

- **GIVEN** a `FusionAccount` instance
- **WHEN** a caller adds a status entitlement
- **THEN** the caller invokes a method on `fusionAccount.collections` (or a nested collection API it exposes)
- **AND** `FusionAccount` does not provide a flat `addStatus` pass-through

#### Scenario: Identity layer enrichment uses FusionAccount orchestration

- **GIVEN** a `FusionAccount` instance and an `IdentityDocument`
- **WHEN** a caller applies the identity layer
- **THEN** the caller invokes `fusionAccount.addIdentityLayer(identity)` (or an equivalent orchestration API on `FusionAccount`)
- **AND** that method delegates to `FusionLayers.addIdentityLayer` with the account's attribute bag and identity bindings

### Requirement: Collaborators SHALL encapsulate their mutable state

`FusionCollections`, `FusionCorrelation`, and `FusionLayers` MUST keep collection and flag state private (or otherwise not publicly mutable sets). Factory and hydrate paths on `FusionAccount` MUST use documented collaborator construction or hydrate methods. Call sites MUST NOT use `_internal_*` accessors to mutate collaborator state from `FusionAccount` factories or from external callers.

#### Scenario: Factory hydration does not use _internal_ mutators

- **GIVEN** a persisted ISC account used with `FusionAccount.fromFusionAccount`
- **WHEN** collection attributes are restored
- **THEN** restoration goes through public or package-documented hydrate APIs on `FusionCollections` / `FusionLayers`
- **AND** the factory path does not call `_internal_*` setters on the collaborator

### Requirement: Collection sync writes the current attribute bag

`FusionAccount.syncCollectionAttributesToBag()` MUST copy `accounts`, `missing-accounts`, `statuses`, `actions`, `reviews`, and `sources` (and other collection mirrors owned by `FusionCollections`) into `attributeBag.current` via `FusionCollections.syncToBag`. The method MUST NOT be required to mirror those collection arrays into `attributeBag.previous`.

#### Scenario: Sync updates current bag

- **GIVEN** a Fusion account with non-empty status and account-id collections
- **WHEN** `syncCollectionAttributesToBag()` is called
- **THEN** `attributeBag.current` contains array representations of those collections
- **AND** the contract does not require those same collection mirrors to be written into `attributeBag.previous`

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

FusionService SHALL access all shared run state through FusionRun at construction time. Internal state previously held on FusionService (`_tracker`, `_managedAccountProcessingState`, `_managedAccountProcessingStartedAt`, `_managedAccountProcessingBatchSize`) SHALL live on FusionRun. Pass-through getters (`sourcesByName`, `_reviewersBySourceId`, `_sourcesWithoutReviewers`, `autoMergedIdentityIds`) SHALL NOT exist — callers SHALL access FusionRun directly.

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

- **WHEN** a single Fusion account is processed outside of an aggregation context (e.g. account read)
- **THEN** the JIT output hook SHALL NOT advance unique attribute counters inappropriately

#### Scenario: Dry-run accountList simulates counters in-memory for output

- **WHEN** the account-list operation runs in dry-run mode and output streaming refreshes unique attributes
- **THEN** incremental counters MAY advance in-memory to produce projected unique values in streamed accounts
- **AND** counter persistence to the ISC tenant SHALL NOT occur (persistent output tail skipped in dry-run)

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

### Requirement: Correlated entitlement reflects missing-accounts outcome

When a Fusion account is built or rebuilt for output, the connector SHALL evaluate the internal missing-account reference set and SHALL grant the `correlated` action entitlement on the returned Fusion account if and only if no missing managed source accounts remain. When missing accounts remain, the `correlated` action entitlement SHALL NOT appear on the returned account. This is an outcome of the Fusion account build process, not an independently removed entitlement.

#### Scenario: Correlated granted when no missing accounts remain

- **GIVEN** a Fusion account whose missing-account reference set is empty after build
- **WHEN** correlation status is updated for output
- **THEN** the returned Fusion account actions SHALL include the `correlated` action entitlement
- **AND** the `Uncorrelated` status entitlement SHALL NOT be present

#### Scenario: Correlated absent when missing accounts remain

- **GIVEN** a Fusion account whose missing-account reference set contains at least one managed account key after build
- **WHEN** correlation status is updated for output
- **THEN** the returned Fusion account actions SHALL NOT include the `correlated` action entitlement
- **AND** the `Uncorrelated` status entitlement SHALL be present

### Requirement: Correlate action assignment triggers direct PATCH for missing accounts on provisioning paths

When the platform assigns the `correlate` or `correlated` action entitlement (Add) on a provisioning path (`accountCreate` or `accountUpdate`), the connector SHALL attempt direct identity correlation (ISC PATCH) for missing managed source accounts on that Fusion account. On this path the connector SHALL NOT apply reverse-correlation attribute writes; reverse correlation remains an aggregation/link flow concern.

#### Scenario: Correlate Add attempts PATCH when missing accounts exist

- **GIVEN** a Fusion account with a non-empty missing-account reference set
- **AND** the Fusion account has a resolvable platform identity id
- **WHEN** the correlate action entitlement is assigned (Add) on a provisioning path
- **THEN** the connector SHALL invoke direct identity correlation for eligible missing managed account keys
- **AND** SHALL update missing-account and correlated action state on the returned Fusion account based on the outcome

#### Scenario: Correlate Add is a no-op when no missing accounts exist

- **GIVEN** a Fusion account whose missing-account reference set is empty
- **WHEN** the correlate action entitlement is assigned (Add) on a provisioning path
- **THEN** the connector SHALL NOT invoke direct identity correlation
- **AND** the returned Fusion account SHALL reflect the correlated entitlement outcome per the missing-accounts evaluation requirement

### Requirement: Reverse-correlation attributes are managed on every Fusion account build

For each configured managed source with `correlationMode: reverse` and a defined `correlationAttribute`, the connector SHALL manage reverse-correlation attribute values on affected Fusion accounts whenever those accounts are built or rebuilt for output (including account-list, account-read, account-update, and other operations returning an ISC Fusion account). Rebuild steps that remap or redefine attributes SHALL NOT permanently clobber reverse-correlation attribute values that were established for the Fusion account; values SHALL be preserved or recomputed according to the active correlation outcome before output.

#### Scenario: Reverse-correlation attribute present on output when correlation applies

- **GIVEN** a managed source configured with `correlationMode: reverse` and `correlationAttribute: revAttr`
- **AND** a Fusion account with a missing managed account from that source eligible for reverse correlation
- **WHEN** the Fusion account is built for output
- **THEN** the returned ISC account attributes SHALL include `revAttr` with the reverse-correlation value for that source when the build path sets it
- **AND** the attribute SHALL remain consistent with the Fusion account correlation outcome

#### Scenario: Account update rebuild preserves reverse-correlation snapshot

- **GIVEN** reverse-correlation sources are configured
- **AND** a Fusion account already has reverse-correlation attribute values on the fusion source row
- **WHEN** the account-update operation rebuilds the Fusion account before processing action changes
- **THEN** the connector SHALL capture reverse-correlation attribute values before rebuild
- **AND** SHALL restore those values after action processing and before generating the ISC account output

### Requirement: Persisted account reference collections MUST use composite managed account keys

When reconstructing a Fusion account from persisted platform attributes, values in the `accounts` and `missing-accounts` collections that represent managed source accounts MUST be valid composite managed account keys (`sourceId::nativeIdentity`). Non-composite values SHALL NOT be retained in internal account reference sets and SHALL NOT be used as lookup keys in the work queue or managed account inventory.

#### Scenario: Non-composite account reference is dropped during reconstruction

- **GIVEN** a persisted Fusion account with `accounts: ["legacy-uuid-only", "src-a::user-1"]`
- **WHEN** the connector reconstructs the Fusion account via `FusionAccount.fromFusionAccount`
- **THEN** the internal account reference set SHALL contain only `src-a::user-1`
- **AND** `legacy-uuid-only` SHALL NOT appear in internal collections or subsequent lookups

#### Scenario: Non-composite missing-account reference is dropped during reconstruction

- **GIVEN** a persisted Fusion account with `missing-accounts: ["legacy-uuid-only"]`
- **WHEN** the connector reconstructs the Fusion account
- **THEN** the internal missing-account reference set SHALL be empty
- **AND** `legacy-uuid-only` SHALL NOT be used for correlation or managed account fetch

### Requirement: originAccount MUST follow origin-type key rules

When loading persisted `originAccount` metadata, the connector SHALL accept a plain identity ID only when the account origin is the Identities source. When the origin is a managed source, `originAccount` MUST be a valid composite managed account key. Non-composite managed-source origin values SHALL NOT be retained as origin account identifiers.

#### Scenario: Identity-origin account retains plain identity ID

- **GIVEN** a persisted Fusion account with `originSource: Identities` and `originAccount: "<identity-uuid>"`
- **WHEN** the connector loads origin metadata
- **THEN** `originAccount` SHALL be set to the identity UUID

#### Scenario: Managed-origin account requires composite originAccount

- **GIVEN** a persisted Fusion account with `originSource: "Workday"` and `originAccount: "src-a::user-1"`
- **WHEN** the connector loads origin metadata
- **THEN** `originAccount` SHALL be set to `src-a::user-1`

#### Scenario: Managed-origin account rejects raw originAccount

- **GIVEN** a persisted Fusion account with `originSource: "Workday"` and `originAccount: "legacy-uuid-only"`
- **WHEN** the connector loads origin metadata
- **THEN** `originAccount` SHALL NOT be set to the raw UUID
- **AND** the invalid value SHALL NOT be used as a managed account lookup key



