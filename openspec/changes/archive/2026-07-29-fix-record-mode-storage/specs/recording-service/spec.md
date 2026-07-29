## ADDED Requirements

### Requirement: Recording configuration SHALL resolve from env vars via resolveRecordingConfig

Recording configuration SHALL be resolved by `resolveRecordingConfig()` during `safeReadConfig()`. When `config.recording.mode` is not explicitly set, `RECORD_MODE=true` SHALL set `mode` to `'record'`. When `chainName` is not set, `RECORD_CHAIN_NAME` SHALL be used. When `verbose` is not set, `VERBOSE_RECORDING=true` SHALL set `verbose` to true. Explicit config values SHALL take precedence over environment variables.

#### Scenario: Env vars activate record mode when config mode unset
- **GIVEN** `process.env.RECORD_MODE` is `'true'` and platform config has no `recording.mode`
- **WHEN** `safeReadConfig()` completes
- **THEN** `config.recording.mode` SHALL be `'record'`
- **AND** `ServiceRegistry` SHALL wire `RecordingApiAdapter` and `RecordingService`

#### Scenario: Explicit config overrides env vars
- **GIVEN** `process.env.RECORD_MODE` is `'true'` and platform config sets `recording.mode` to `'off'`
- **WHEN** `safeReadConfig()` completes
- **THEN** `config.recording.mode` SHALL be `'off'`
- **AND** `RecordingService` SHALL NOT be initialized

---

### Requirement: RecordingService SHALL use a pluggable RecordingStore

RecordingService SHALL delegate all artifact persistence to a `RecordingStore` implementation selected by `config.recording.store` (default `'ndjson'`). The default `NdjsonRecordingStore` SHALL append api-log entries to `api-log.ndjson`, steps to `steps.ndjson`, and phase events to `phases.ndjson` under the chain recording directory.

#### Scenario: NdjsonRecordingStore persists api-log entries
- **WHEN** `RecordingService` receives an API call via `onApiCall` in record mode with default store
- **THEN** the store SHALL append one NDJSON line to `api-log.ndjson`

#### Scenario: Manifest written on finalize
- **WHEN** `RecordingService.finalizeOnce()` completes
- **THEN** `manifest.json` SHALL be written with store type, artifact paths, api-log entry count, and operation metadata

---

### Requirement: RecordingService lifecycle SHALL finalize once per process

RecordingService SHALL NOT use a process-wide singleton. Each `ServiceRegistry` construction in record mode SHALL create a dedicated `RecordingService` instance. Finalization SHALL occur once per process exit (SIGINT, SIGTERM, or `beforeExit`), not after every operation. `steps.ndjson` SHALL be retained after finalize (not deleted).

#### Scenario: Multi-operation chain accumulates steps
- **GIVEN** two operations run in the same process with recording enabled
- **WHEN** the first operation completes
- **THEN** `finalizeOnce()` SHALL NOT yet write the final `scenario.json`
- **WHEN** the process exits after the second operation
- **THEN** `scenario.json` SHALL contain steps from both operations

#### Scenario: Steps file retained after finalize
- **WHEN** `RecordingService.finalizeOnce()` completes
- **THEN** `steps.ndjson` SHALL remain on disk

---

### Requirement: RecordingService SHALL capture phase boundaries when recording

When `config.recording.mode` is `'record'`, log service phase and step boundaries SHALL append summary records to `phases.ndjson` via the active `RecordingStore`, including phase name, elapsed duration, and run counts (managed accounts, fusion accounts, api calls).

#### Scenario: Process phase end recorded
- **WHEN** a PHASE END line is emitted during an account-list operation in record mode
- **THEN** a corresponding entry SHALL be appended to `phases.ndjson`

---

### Requirement: RecordingService SHALL optionally persist aggregation report locally

When record mode is active and the aggregation report epilogue generates a report, the report payload SHALL be written to `reports/aggregation.json` in the chain recording directory. Email and ISC send behavior SHALL remain unchanged.

#### Scenario: Local aggregation report artifact written
- **GIVEN** a persistent account-list operation in record mode with aggregation report enabled
- **WHEN** the report epilogue generates the aggregation report successfully
- **THEN** the report payload SHALL be written to `reports/aggregation.json`

---

## MODIFIED Requirements

### Requirement: Recording configuration SHALL be centralized in RecordingConfig

All recording configuration SHALL flow through a `RecordingConfig` object on `FusionConfig`, resolved by `resolveRecordingConfig()` during config load. No recording-related environment variable SHALL be read directly by `RecordingService` or `FusionRun`. Environment variables `RECORD_MODE`, `RECORD_CHAIN_NAME`, and `VERBOSE_RECORDING` SHALL be consumed only by `resolveRecordingConfig()` as fallbacks when explicit config fields are unset.

#### Scenario: RecordingConfig on FusionConfig
- **WHEN** `FusionConfig` is constructed with recording settings
- **THEN** `config.recording` SHALL contain `{ mode, chainName?, verbose?, store? }`
- **AND** `RecordingService` SHALL read chain name, verbosity, and store type from config, not from `process.env`

#### Scenario: ServiceRegistry wires adapters from config
- **WHEN** `ServiceRegistry` is constructed with `config.recording.mode = 'record'`
- **THEN** it SHALL wire `RecordingApiAdapter` wrapping `SdkApiAdapter`
- **WHEN** `config.recording.mode = 'replay'`
- **THEN** it SHALL wire `ReplayApiAdapter` loaded from the api-log path
- **WHEN** `config.recording.mode` is `'off'` or undefined after resolution
- **THEN** it SHALL wire `SdkApiAdapter` directly (no change from current behavior)

---

### Requirement: RecordingService lifecycle SHALL finalize on operation end

RecordingService SHALL call `finalizeOnce()` when the connector process exits cleanly or receives SIGINT/SIGTERM, producing a complete `scenario.json` and `manifest.json`. Operation handlers SHALL call `endOperation()` per operation but SHALL NOT call `finalizeOnce()` in a per-operation finally block.

#### Scenario: Operation handler finalizes recording
- **WHEN** `createOperationHandler` completes an operation (success or error)
- **THEN** it SHALL call `recording.endOperation()` but SHALL NOT call `recording.finalizeOnce()` in a finally block
- **AND** `scenario.json` SHALL be written when the process exits via `finalizeOnce()`

#### Scenario: Process exit finalizes recording
- **WHEN** the connector process exits after one or more recorded operations
- **THEN** `recording.finalizeOnce()` SHALL have been called exactly once
- **AND** `scenario.json` SHALL be written to disk

#### Scenario: Signal handler finalizes recording
- **WHEN** the connector process receives SIGINT during a recorded operation
- **THEN** `recording.finalizeOnce()` SHALL write `scenario.json` before exit

---

### Requirement: RecordingService SHALL record ISC API responses via RecordingApiAdapter

RecordingService SHALL persist all ISC API request/response pairs through the active `RecordingStore`. The default NDJSON store SHALL write to `api-log.ndjson`. Each entry SHALL include the API getter name, method name, serialized arguments, serialized response, and timestamp.

#### Scenario: RecordingService persists api-log entries
- **WHEN** `RecordingService` is initialized in record mode
- **THEN** it SHALL provide an `onApiCall(entry: ApiLogEntry)` callback to `RecordingApiAdapter`
- **AND** each API call SHALL be persisted via the active `RecordingStore`

#### Scenario: Scenario.json includes api-log path
- **WHEN** `RecordingService.finalizeOnce()` compiles the scenario file
- **THEN** the scenario.json SHALL include an `apiLogPath` field referencing the api-log file
- **AND** manifest.json SHALL declare the store type and api-log entry count
