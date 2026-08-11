## ADDED Requirements

### Requirement: Form definition stale checks SHALL use FusionRun current time

When evaluating whether a form definition is stale during `fetchFormInstances` stale cleanup, FormService MUST compare the form definition timestamp against a cutoff derived from `FusionRun.currentTimeMs()` and `fusionFormExpirationDays`, not bare wall-clock `Date.now()`.

#### Scenario: Form active at recorded replay time

- **GIVEN** `fusionFormExpirationDays` is 7
- **AND** a form definition was created 3 days before the simulated replay time
- **AND** FusionRun simulated time is set to the recorded step timestamp
- **WHEN** `fetchFormInstances({ staleFormCleanup: true })` runs in replay mode
- **THEN** the form definition MUST be classified as active
- **AND** MUST NOT be queued for deletion solely due to wall-clock age

#### Scenario: Form stale at recorded replay time

- **GIVEN** `fusionFormExpirationDays` is 7
- **AND** a form definition was created 10 days before the simulated replay time
- **WHEN** stale cleanup runs with simulated time set to the recorded step timestamp
- **THEN** the form definition MUST be classified as stale
- **AND** MAY be queued for deletion per existing stale cleanup rules

#### Scenario: Live aggregation unchanged without simulated time

- **GIVEN** FusionRun has no simulated time set
- **WHEN** stale cleanup runs during a live aggregation
- **THEN** cutoff calculation MUST use wall-clock time via `currentTimeMs()`
- **AND** behavior MUST match pre-change production semantics
