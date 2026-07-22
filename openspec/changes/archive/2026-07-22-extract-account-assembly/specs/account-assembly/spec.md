## ADDED Requirements

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
