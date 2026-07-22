# fusion-service Spec (delta)

## MODIFIED Requirements

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

## REMOVED Requirements

None.
