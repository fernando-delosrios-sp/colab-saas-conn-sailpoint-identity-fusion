## ADDED Requirements

### Requirement: RecordingService SHALL record ISC API responses via RecordingApiAdapter

RecordingService SHALL persist all ISC API request/response pairs to an api-log file (`api-log.ndjson`) in the recording directory. Each entry SHALL include the API getter name, method name, serialized arguments, serialized response, and timestamp.

#### Scenario: RecordingService persists api-log entries
- **WHEN** `RecordingService` is initialized in record mode
- **THEN** it SHALL provide an `onApiCall(entry: ApiLogEntry)` callback to `RecordingApiAdapter`
- **AND** each API call SHALL append one NDJSON line to `api-log.ndjson` in the recording directory

#### Scenario: Scenario.json includes api-log path
- **WHEN** `RecordingService.finalize()` compiles the scenario file
- **THEN** the scenario.json SHALL include an `apiLogPath` field referencing the api-log file

### Requirement: RecordingService lifecycle SHALL finalize on operation end

RecordingService SHALL call `finalize()` when the operation completes successfully, in addition to signal handlers (SIGINT/SIGTERM). A clean process exit SHALL produce a complete `scenario.json` file.

#### Scenario: Operation handler finalizes recording
- **WHEN** `createOperationHandler` completes an operation (success or error)
- **THEN** it SHALL call `recording.finalize()` in a finally block
- **AND** `scenario.json` is written to disk regardless of how the process exits

### Requirement: Recording configuration SHALL be centralized in RecordingConfig

All recording configuration SHALL flow through a `RecordingConfig` object on `FusionConfig`. No recording-related environment variable SHALL be read directly by `RecordingService`.

#### Scenario: RecordingConfig on FusionConfig
- **WHEN** `FusionConfig` is constructed with recording settings
- **THEN** `config.recording` SHALL contain `{ mode, chainName?, verbose? }`
- **AND** `RecordingService` SHALL read chain name and verbosity from config, not from `process.env`

#### Scenario: ServiceRegistry wires adapters from config
- **WHEN** `ServiceRegistry` is constructed with `config.recording.mode = 'record'`
- **THEN** it SHALL wire `RecordingApiAdapter` wrapping `SdkApiAdapter`
- **WHEN** `config.recording.mode = 'replay'`
- **THEN** it SHALL wire `ReplayApiAdapter` loaded from the api-log path
- **WHEN** `config.recording.mode` is `'off'` or undefined
- **THEN** it SHALL wire `SdkApiAdapter` directly (no change from current behavior)

## MODIFIED Requirements

### Requirement: RecordingService snapshots FusionRun instead of individual services

RecordingService SHALL capture operation state by calling `run.snapshot()` on the FusionRun instance and SHALL capture ISC API data through `RecordingApiAdapter`. State snapshots remain for assertion; API data is the replay data source.

#### Scenario: startOperation receives FusionRun
- **WHEN** RecordingService.startOperation is called
- **THEN** it SHALL receive FusionRun as a parameter
- **AND** it SHALL call run.snapshot() to capture the initial state
- **AND** api-log recording SHALL be active via the RecordingApiAdapter callback

#### Scenario: endOperation snapshots FusionRun
- **WHEN** RecordingService.endOperation is called
- **THEN** it SHALL call run.snapshot() to capture the final state
- **AND** it SHALL NOT access individual service internals
