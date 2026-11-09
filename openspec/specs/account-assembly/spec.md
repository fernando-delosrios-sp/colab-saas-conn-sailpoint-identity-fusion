# account-assembly Specification

## Purpose

The `AccountAssembly` service (`src/services/accountAssembly/`) provides a single, consolidated account assembly recipe used by all processors (`FusionService`, `IdentityProcessor`, `DecisionProcessor`, and `MatchOutcomeDispatcher`). It encapsulates mode gates, layer application, Map/Define attribute processing, and registration of Fusion accounts and blend history.

## Requirements

### Requirement: Single Account Assembly Recipe

The `AccountAssembly` service SHALL own and execute the unified account assembly recipe for absorbing managed account layers and identity attributes into `FusionAccount` instances.

#### Scenario: Assembling a managed account layer
- **WHEN** a managed account layer is applied to a Fusion account
- **THEN** `AccountAssembly` SHALL evaluate mode gates, apply attribute processing, register the managed account layer, and handle blend recording.

### Requirement: Mode Gate and Pruning Logic

`AccountAssembly` SHALL evaluate aggregation list mode gates and determine whether deleted managed accounts MUST be pruned.

#### Scenario: Evaluating account list mode and pruning
- **GIVEN** an aggregation run configuration
- **WHEN** `AccountAssembly` checks mode conditions
- **THEN** it SHALL evaluate `isAggregationAccountListMode` and `shouldPruneDeletedManagedAccounts` consistently across all calling processors.

### Requirement: Attribute Processing and Layer Registration

`AccountAssembly` SHALL apply Map & Define attribute transformation rules and register managed account layers on the target `FusionAccount`.

#### Scenario: Applying layer attribute transformations
- **WHEN** an account layer is assembled
- **THEN** `AccountAssembly` SHALL execute `applyAttributeProcessing` and invoke `addManagedAccountLayer` with normalized `skipBlendHistoryForManagedKeys`.

### Requirement: Optimized FusionAccount construction and static configuration

FusionAccount construction SHALL reuse a shared, precomputed static set of managed source names across all instances and SHALL initialize attribute bags in a single pass without redundant intermediate dictionary clones.

#### Scenario: FusionAccount shares precomputed static managed source names

- **GIVEN** a connector configuration with configured managed sources
- **WHEN** `FusionAccount.configure` is invoked at run start
- **THEN** it SHALL precompute a static `ReadonlySet<string>` of managed source names
- **AND** all newly constructed `FusionAccount` instances SHALL reference this shared static set rather than allocating per-instance sets

#### Scenario: Factory seeding performs single-pass attribute bag initialization

- **GIVEN** raw attributes from a platform account
- **WHEN** `fromFusionAccount` initializes the account's attribute bags
- **THEN** it SHALL omit nullish keys in a single pass for `attributeBag.current`
- **AND** it SHALL NOT create duplicate intermediate shallow copies of the attribute dictionary
