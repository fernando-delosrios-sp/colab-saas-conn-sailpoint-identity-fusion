## ADDED Requirements

### Requirement: LogService SHALL clear stale step progress on step boundaries

`LogService.stepStart()` and `LogService.stepEnd()` SHALL clear `runContext.progress` so a newly started step never inherits and displays the previous step's `done/total` progress in `STATUS` heartbeats.

#### Scenario: Starting a new step clears progress from the previous step
- **GIVEN** a `LogService` with an active `OperationRunContext` whose `progress` was set to `130/130` during `correlated-sweep`
- **WHEN** `stepEnd('correlated-sweep')` and `stepStart('uncorrelated-sweep', { accounts: 1000 })` are called
- **THEN** `runContext.progress` SHALL be `undefined` until the new step calls `setProgress()`
