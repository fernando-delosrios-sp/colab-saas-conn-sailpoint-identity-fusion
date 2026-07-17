## ADDED Requirements

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
