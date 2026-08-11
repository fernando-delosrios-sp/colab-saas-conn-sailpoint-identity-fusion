## ADDED Requirements

### Requirement: Replay mode SHALL establish simulated recording time per scenario step

When `config.recording.mode` is `'replay'`, the connector MUST set FusionRun simulated time at the start of each replayed operation step to the step's recorded timestamp before executing operation logic that depends on current time. Simulated time MUST be cleared after the step completes. The timestamp source MUST prefer `steps.ndjson` per-step `timestamp`, then `scenario.json` `recordedAt`, then wall clock with a logged warning.

#### Scenario: In-process replay sets time before accountList fetch

- **GIVEN** scenario replay executes step-23 with timestamp `2026-07-31T08:24:12.899Z`
- **WHEN** the step begins and `ReplayApiAdapter.seekBefore` runs
- **THEN** FusionRun simulated time MUST be set to that timestamp before fetch phase form processing
- **AND** MUST be cleared after the step finishes

#### Scenario: Spawned replay CLI passes step timestamp

- **GIVEN** `npm run replay -- tenant/scenario` feeds steps sequentially
- **WHEN** each step is POSTed to the replay connector
- **THEN** the connector MUST receive enough metadata to set simulated time for that step
- **AND** form fetch during that step MUST evaluate stale cleanup against simulated time

#### Scenario: Missing step timestamp falls back safely

- **GIVEN** a scenario step has no entry in `steps.ndjson` timestamps
- **WHEN** replay executes that step
- **THEN** simulated time MUST fall back to `scenario.recordedAt` if present
- **AND** MUST log a warning when falling back to wall clock
