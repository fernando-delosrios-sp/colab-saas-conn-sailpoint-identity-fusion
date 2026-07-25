## ADDED Requirements

### Requirement: Partial match SHALL claim the managed account after successful review form creation

When `MatchOutcomeDispatcher.handlePartialMatch` successfully creates or reuses a Fusion review form (`createFusionForm` returns `formDefinitionReady: true`), it SHALL remove the managed account from the work queue via `run.claimAccount` using the composite managed-account key and source account `identityId`, in addition to any existing match-tracker adjustments.

#### Scenario: Partial match claims account from work queue
- **GIVEN** a managed account on the work queue with composite key `sourceId::nativeIdentity`
- **WHEN** partial match handling creates or reuses a review form successfully
- **THEN** `run.claimAccount('sourceId::nativeIdentity', identityId)` SHALL be called
- **AND** the account SHALL not remain available to subsequent Match scoring in the same aggregation run

#### Scenario: Failed form creation does not claim the account
- **GIVEN** `createFusionForm` returns `formDefinitionReady: false` or throws
- **WHEN** partial match handling completes
- **THEN** `run.claimAccount` SHALL NOT be invoked for that account solely due to partial-match dispatch
