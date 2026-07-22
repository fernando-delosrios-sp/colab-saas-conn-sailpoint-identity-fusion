# matching-service Spec (delta)

## MODIFIED Requirements

### Requirement: MatchOutcomeDispatcher delegates mode-gate logic to AccountAssembly

MatchOutcomeDispatcher SHALL delegate aggregation-mode detection to the injected `AccountAssembly` collaborator. MatchOutcomeDispatcher SHALL NOT own its own copy of `isAggregationAccountListMode`.

#### Scenario: Aggregation mode checked via AccountAssembly
- **WHEN** MatchOutcomeDispatcher needs to determine if the current operation is an aggregation run
- **THEN** it SHALL call `this.deps.accountAssembly.isAggregationAccountListMode()`
- **AND** the method definition SHALL NOT exist on MatchOutcomeDispatcher

## REMOVED Requirements

None.
