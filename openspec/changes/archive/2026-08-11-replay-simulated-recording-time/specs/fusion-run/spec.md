## ADDED Requirements

### Requirement: FusionRun SHALL expose a run-scoped current time for replay simulation

FusionRun SHALL maintain an optional simulated current time in milliseconds. When simulated time is set, `currentTimeMs()` MUST return that value. When simulated time is not set, `currentTimeMs()` MUST return wall-clock `Date.now()`. `setSimulatedTime()` and `clearSimulatedTime()` MUST be the only mutators for simulated time on a run instance.

#### Scenario: Simulated time overrides wall clock

- **GIVEN** a FusionRun instance
- **WHEN** `setSimulatedTime('2026-07-31T08:24:12.899Z')` is called
- **THEN** `currentTimeMs()` MUST equal the parsed timestamp in milliseconds
- **AND** `currentTimeMs()` MUST NOT equal wall-clock time unless they coincide by chance

#### Scenario: Clearing simulated time restores wall clock

- **GIVEN** a FusionRun with simulated time set
- **WHEN** `clearSimulatedTime()` is called
- **THEN** subsequent `currentTimeMs()` MUST behave as wall-clock time

#### Scenario: Snapshot and restore preserve simulated time

- **GIVEN** a FusionRun with simulated time set
- **WHEN** `snapshot()` is called and the snapshot is restored on a new run
- **THEN** the restored run MUST preserve the simulated time value if present in the snapshot
