## MODIFIED Requirements

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

### Requirement: FusionService avoids redundant delegation wrappers

FusionService SHALL NOT wrap outcome handler methods with single-line delegation methods. Internal references to outcome handlers SHALL directly access `this.outcomeHandler` to improve readability and maintainability.

#### Scenario: Calling outcome handlers directly
- **WHEN** FusionService evaluates match outcomes
- **THEN** it calls methods directly on `this.outcomeHandler` (e.g. `this.outcomeHandler.handleIdentityMatch`) rather than proxying through `this.handleIdentityMatch`

## REMOVED Requirements

### Requirement: FusionService pass-through getters

**Reason:** These getters duplicate access already available via `this.run.*`. Most callers already access `run` directly. The getters are vestigial after the state-relocation refactors.

**Migration:** Call sites that reference `this.sourcesByName`, `this._reviewersBySourceId`, `this._sourcesWithoutReviewers`, or `this.autoAssignedIdentityIds` on FusionService SHALL be updated to reference `this.run.sourcesByName`, `this.run.reviewersBySourceId`, `this.run.sourcesWithoutReviewers`, and `this.run.autoAssignedIdentityIds` respectively.
