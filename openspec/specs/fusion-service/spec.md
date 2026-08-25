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

Each static factory method MUST produce a `FusionAccount` whose core scalar fields (`type`, `managedKey`, `name`, `sourceName`, `disabled`, `needsRefresh`, `identityInfo`, `iscAccountId`, `modified`) are set from the provided input.

Feature: Fusion account construction
Rule: `FusionAccount` factory methods initialize core scalar state from their inputs.

#### Scenario: fromIdentity initializes identity-origin core state
- **GIVEN** an `IdentityDocument` with `id: 'id-1'`, `name: 'Jane Doe'`, `disabled: false`
- **WHEN** `FusionAccount.fromIdentity(identity)` is called
- **THEN** the resulting account has `type` of `'identity'`
- **AND** `managedKey` is `'Identities::id-1'`
- **AND** `name` is `'Jane Doe'`
- **AND** `sourceName` is `'Identities'`
- **AND** `disabled` is `false`

#### Scenario: fromManagedAccount initializes managed-origin core state
- **GIVEN** an SDK `Account` with `sourceId: 'src-a'`, `nativeIdentity: 'nat-1'`, `sourceName: 'Source A'`, `id: 'isc-1'`
- **WHEN** `FusionAccount.fromManagedAccount(account)` is called
- **THEN** the resulting account has `type` of `'managed'`
- **AND** `managedKey` is `'src-a::nat-1'`
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

### Requirement: Previous bag preserves prior-aggregation collection mirrors

When a Fusion account is constructed from persisted ISC account attributes (for example via `FusionAccount.fromFusionAccount` or other factory paths that seed `attributeBagPrevious` from stored attributes), `attributeBag.previous` MUST be populated with the persisted collection mirror attributes (`accounts`, `missing-accounts`, `statuses`, `actions`, `reviews`, `sources`, `history`, and other collection-backed fields present on the stored account). That snapshot MUST remain available for Velocity as `$previous` for the duration of the aggregation run. `syncCollectionAttributesToBag` MUST NOT overwrite `attributeBag.previous`.

#### Scenario: Persisted fusion account exposes collection mirrors in $previous

- **GIVEN** a persisted fusion account whose stored attributes include `statuses`, `actions`, and `accounts`
- **WHEN** the account is loaded via the fusion-account factory
- **THEN** `attributeBag.previous` contains those collection mirror arrays
- **AND** Velocity context `$previous.statuses`, `$previous.actions`, and `$previous.accounts` are available for attribute definitions

#### Scenario: Sync does not clobber the previous snapshot

- **GIVEN** a fusion account whose `attributeBag.previous` was seeded at factory load
- **WHEN** collection sets are mutated during the run and `syncCollectionAttributesToBag()` is called
- **THEN** `attributeBag.previous` retains the factory-seeded collection mirror values
- **AND** only `attributeBag.current` receives the updated collection mirrors from sync

### Requirement: Collection sync writes the current attribute bag

`FusionAccount.syncCollectionAttributesToBag()` MUST copy `accounts`, `missing-accounts`, `statuses`, `actions`, `reviews`, and `sources` (and other collection mirrors owned by `FusionCollections`) into `attributeBag.current` via `FusionCollections.syncToBag`. The method MUST NOT mirror those collection arrays into `attributeBag.previous`; prior-aggregation collection mirrors in `attributeBag.previous` are seeded at factory load (see previous requirement).

#### Scenario: Sync updates current bag

- **GIVEN** a Fusion account with non-empty status and account-id collections
- **WHEN** `syncCollectionAttributesToBag()` is called
- **THEN** `attributeBag.current` contains array representations of those collections
- **AND** the contract does not require those same collection mirrors to be written into `attributeBag.previous`

### Requirement: FusionService owns managed-account pipeline phases

FusionService SHALL orchestrate the managed-account Process-phase pipeline in order: (1) `initializeManagedAccountProcessing`, (2) correlated account sweep, (3) record unique registration, (4) uncorrelated sweep, followed by disable-operation drain and form reconciliation as defined elsewhere. FusionService SHALL NOT duplicate match outcome resolution logic inside private methods — all match dispatch for managed accounts SHALL go through `MatchOutcomeDispatcher.runMatchSweep()`.

#### Scenario: Process phase runs pipeline phases in order

- **WHEN** the account-list process phase executes managed-account processing
- **THEN** FusionService SHALL run managed-account init, correlated sweep, record unique registration, and uncorrelated sweep in that order
- **AND** each phase SHALL use the public methods defined on FusionService for that phase

#### Scenario: Correlated account sweep remains a FusionService pipeline phase

- **WHEN** `processCorrelatedManagedAccounts` runs
- **THEN** FusionService SHALL filter managed accounts with `uncorrelated === false`
- **AND** FusionService SHALL orchestrate per-account processing before the uncorrelated batch sweep
- **AND** the correlated account sweep SHALL NOT be classified as the identity-scoring or deferred-drain sweep owned by MatchOutcomeDispatcher

### Requirement: FusionService delegates match outcome dispatch to MatchOutcomeDispatcher

FusionService SHALL delegate managed-account match outcome dispatch to `MatchOutcomeDispatcher.runMatchSweep()`. FusionService SHALL NOT call MatchOutcomeDispatcher scoring internals (for example `scoreIdentityPhase`, deferred drain helpers) or invoke `MatchingService` comparison methods directly to perform a sweep. FusionService MAY call `MatchingService` scoring-prep methods (`buildTrigramIndex`, `configureScoring`) during `initializeManagedAccountProcessing`.

#### Scenario: Uncorrelated sweep delegates to MatchOutcomeDispatcher

- **WHEN** `processUncorrelatedManagedAccounts` drains the remaining work queue
- **THEN** FusionService SHALL call `matchOutcomeDispatcher.runMatchSweep(accounts, batchSize)` once with the full remaining queue
- **AND** FusionService SHALL NOT invoke `MatchingService.processUncorrelatedManagedAccounts`

#### Scenario: Single-account processing delegates to MatchOutcomeDispatcher

- **WHEN** `processManagedAccount` handles one managed account
- **THEN** FusionService SHALL call `matchOutcomeDispatcher.runMatchSweep([account], 1)`
- **AND** FusionService SHALL NOT implement its own outcome resolution switch for that account

#### Scenario: Scoring prep during init is permitted

- **WHEN** `initializeManagedAccountProcessing` completes
- **THEN** FusionService SHALL have called `matchingService.buildTrigramIndex` with the current fusion identity iterable
- **AND** FusionService SHALL have called `matchingService.configureScoring` with `captureBreakdown` derived from report-capture settings
- **AND** FusionService SHALL have seeded deferred candidates and built the linked-account key index as part of the same init phase

#### Scenario: FusionService does not orchestrate sweep scoring internals

- **WHEN** a managed-account sweep runs
- **THEN** FusionService SHALL NOT call `scoreIdentityPhase` or deferred drain helpers directly
- **AND** those steps SHALL execute only inside `MatchOutcomeDispatcher.runMatchSweep`

### Requirement: FusionService receives state via FusionRun

FusionService SHALL access all shared run state through FusionRun at construction time. Internal state previously held on FusionService (`_tracker`, `_managedAccountProcessingState`, `_managedAccountProcessingStartedAt`, `_managedAccountProcessingBatchSize`) SHALL live on FusionRun. Pass-through getters that expose raw FusionRun maps or sets (`sourcesByName`, `reviewersBySourceId`, `sourcesWithoutReviewers`, `autoMergedIdentityIds`, `fusionAccounts`, `fusionIdentities`, `totalFusionAccountCount`) SHALL NOT exist on FusionService — callers SHALL access FusionRun directly.

FusionService MAY expose a small set of operation-facing methods that delegate to FusionRun without exposing mutable collections:

- `getFusionIdentity(identityId)` — stable lookup API for provisioning operations
- `setTracker(tracker)` — orchestration hook that delegates to `run.setTracker()`
- `fusionIdentitiesExcluding(excludeIds)` — filtered identity iteration for scoring prep

FusionService SHALL NOT expose a public `tracker` getter. Internal code that requires a non-null tracker SHALL use a private `requireTracker()` helper with invariant enforcement.

Services that receive FusionRun (ReportService, FormService, MatchOutcomeDispatcher, processors) SHALL read run state from `run` directly, not through FusionService getters.

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

#### Scenario: ReportService reads tracker from FusionRun
- **WHEN** ReportService builds an aggregation or dry-run report
- **THEN** it SHALL call `run.getTracker()` with local non-null enforcement
- **AND** it SHALL NOT read tracker via a FusionService getter

#### Scenario: Operation-facing identity lookup remains on FusionService
- **WHEN** a provisioning operation needs the fusion identity for a processed identity
- **THEN** it MAY call `fusion.getFusionIdentity(identityId)`
- **AND** FusionService SHALL delegate to `run.getFusionIdentity(identityId)`

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

The system SHALL NOT eagerly filter and output Fusion accounts prior to the final output phase to bypass memory constraints. Instead, the system SHALL stream all Fusion accounts uniformly during the final output phase via `FusionService.forEachISCAccount`, evaluating and generating unique attributes Just-In-Time immediately prior to serialization. Bulk listing helpers such as `listISCAccounts` SHALL NOT be used on the account-list output path.

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

### Requirement: processFusionAccount composes the extended account-assembly recipe

`FusionService.processFusionAccount` SHALL compose the shared `AccountAssembly` steps (`addManagedAccountLayer`, `applyAttributeProcessing`) together with fusion-specific orchestration that callers of the thin `assembleAccount` recipe do not perform: reviewer layers, identity and merge-decision layers, unique-attribute registration, per-source correlation, and run registration. IdentityProcessor and DecisionProcessor SHALL continue to use `AccountAssembly.assembleAccount` for the thin path; Phase-2 refresh and single-account rebuild paths SHALL use `processFusionAccount`.

#### Scenario: Phase-2 refresh uses extended recipe
- **WHEN** `FusionService.processFusionAccounts` refreshes persisted fusion accounts during aggregation
- **THEN** each account SHALL be built via `processFusionAccount`
- **AND** the method SHALL invoke `AccountAssembly.addManagedAccountLayer` and `AccountAssembly.applyAttributeProcessing`
- **AND** the method SHALL apply reviewer, identity, correlation, and registration steps before returning the processed account

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

When a Fusion account is built or rebuilt for output, the connector SHALL evaluate the internal missing-account reference set and SHALL grant the `correlated` action entitlement on the returned Fusion account if and only if no missing managed source accounts remain. When missing accounts remain, the `correlated` action entitlement SHALL NOT appear on the returned account. This is an outcome of the Fusion account build process, not an independently removed entitlement. On provisioning paths (`accountCreate`, `accountUpdate`), a Remove change for `correlate` or `correlated` action tokens SHALL fail the operation with message matching `Correlated entitlement cannot be removed: <value>`; the connector SHALL NOT honor entitlement revocation for derived correlated state.

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

#### Scenario: Correlated Remove rejected on provisioning path

- **GIVEN** a Fusion account whose missing-account reference set is empty
- **WHEN** a Remove change for the `correlated` action entitlement is processed on a provisioning path
- **THEN** the operation SHALL fail with a message matching `Correlated entitlement cannot be removed: correlated`
- **AND** the connector SHALL NOT mutate correlation links or missing-account state

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

### Requirement: Managed source Match scoring eligibility uses automatic merge and manual review toggles

During `initializeManagedAccountProcessing`, `FusionService.validateManagedSourceReviewers` SHALL evaluate each managed source for Match scoring eligibility. A source SHALL enter Match scoring when **`fusionEnableAutoMerge`** is true **or** when **`fusionEnableManualReview`** is true and the source has at least one reviewer in `run.reviewersBySourceId`. When neither condition holds, the source SHALL be added to `run.sourcesWithoutReviewers` and a log SHALL be emitted once per source stating accounts will be treated as non-matched: ERROR when **`fusionEnableManualReview`** is true (reviewers missing), INFO when **`fusionEnableManualReview`** is false (Match scoring intentionally disabled). When automatic merge is enabled and the source has zero reviewers, the source SHALL NOT be added to `run.sourcesWithoutReviewers`, and a WARN log SHALL state manual review is unavailable and borderline matches will register as non-match.

#### Scenario: Manual review enabled without reviewers and automatic merge disabled skips scoring

- **GIVEN** `fusionEnableAutoMerge` is false
- **AND** `fusionEnableManualReview` is true
- **AND** managed source `"Source A"` has zero reviewers in `run.reviewersBySourceId`
- **WHEN** `validateManagedSourceReviewers` runs during managed account initialization
- **THEN** `"Source A"` SHALL be present in `run.sourcesWithoutReviewers`
- **AND** an ERROR log SHALL mention that Match scoring is not configured

#### Scenario: Automatic merge enabled without reviewers allows scoring

- **GIVEN** `fusionEnableAutoMerge` is true
- **AND** managed source `"Source A"` has zero reviewers in `run.reviewersBySourceId`
- **WHEN** `validateManagedSourceReviewers` runs during managed account initialization
- **THEN** `"Source A"` SHALL NOT be present in `run.sourcesWithoutReviewers`
- **AND** a WARN log SHALL mention manual review is unavailable

#### Scenario: Manual review enabled with reviewers allows scoring

- **GIVEN** `fusionEnableManualReview` is true
- **AND** managed source `"Source A"` has at least one reviewer in `run.reviewersBySourceId`
- **WHEN** `validateManagedSourceReviewers` runs
- **THEN** `"Source A"` SHALL NOT be present in `run.sourcesWithoutReviewers`

#### Scenario: Both automatic merge and manual review disabled skips scoring

- **GIVEN** `fusionEnableAutoMerge` is false
- **AND** `fusionEnableManualReview` is false
- **WHEN** `validateManagedSourceReviewers` runs for managed source `"Source A"`
- **THEN** `"Source A"` SHALL be present in `run.sourcesWithoutReviewers`
- **AND** an INFO log SHALL mention that Match scoring is not configured
- **AND** an ERROR log SHALL NOT mention that Match scoring is not configured

### Requirement: Unique JIT on Output does not hold the unique registry lock during Velocity evaluation

`FusionService.forEachISCAccount` SHALL continue to call `refreshUniqueAttributes` immediately before `getISCAccount` for accounts with `needsRefresh` when unique refresh is enabled. Unique template evaluation SHALL follow `definition-service` (registry lock does not cover Velocity). This requirement does not allow calling `listISCAccounts` on the account-list output path, eager Unique generation during Process, or skipping in-memory counter advance during dry-run Output.

#### Scenario: JIT Unique generation still precedes serialize

- **GIVEN** a Fusion account that requires Unique attribute generation
- **WHEN** Output iterates that account via `forEachISCAccount` with unique refresh enabled
- **THEN** Unique attributes SHALL be generated immediately before serialization
- **AND** the serialized account SHALL then be removed from memory as today

#### Scenario: Dry-run Output still uses in-memory counters

- **GIVEN** account-list dry-run with Unique incremental counters
- **WHEN** Output refreshes Unique attributes
- **THEN** in-memory counters MAY advance to project unique values
- **AND** counter persistence to the ISC tenant SHALL NOT occur

### Requirement: processFusionAccount records Refresh sub-step metrics

When the bound operation run context phase is `Refresh`, `FusionService.processFusionAccount` SHALL record wall-clock durations into Refresh-phase aggregate buckets (`prelude`, `managedLayer`, `uniqueRegister`, `map`, `normalDefine`, `correlation`, and `finalize`) without emitting per-account METRIC or INFO lines for those sub-steps. When the phase is not `Refresh`, the same recipe SHALL run and Refresh-phase metrics SHALL NOT increment.

#### Scenario: Refresh phase records sub-step timings without per-account METRIC

- **GIVEN** `processFusionAccount` runs during account-list Refresh
- **WHEN** the extended account-assembly recipe completes for a Fusion account
- **THEN** Refresh-phase metrics SHALL include the sub-step durations for that account
- **AND** the connector SHALL NOT emit a METRIC line per Fusion account for those sub-steps

#### Scenario: Non-Refresh processFusionAccount does not increment Refresh metrics

- **GIVEN** `processFusionAccount` is invoked during Process phase or a single-account rebuild
- **WHEN** sub-step timing hooks execute
- **THEN** Refresh-phase metrics SHALL NOT increment




