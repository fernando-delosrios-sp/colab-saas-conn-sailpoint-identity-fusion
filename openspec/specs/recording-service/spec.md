# recording-service Spec

## Purpose

The recording service captures the outcomes of managed-account analysis (matches, deferred candidate matches, non-matches, and failures) into the aggregation tracker so they can be reported to downstream connector operations and aggregation consumers.
## Requirements
### Requirement: Record managed account analysis for identity-origin matches
The `ManagedAccountAnalysisRecorder.recordAnalysis` method SHALL be called exactly once per managed account after the two-sweep analysis (identity scoring + deferred candidate scoring) completes. It SHALL record an identity-origin match by pushing the `FusionAccount` into `tracker.matchAccounts` and logging match discovery information. The method SHALL NOT be called during intermediate phases of the analysis pipeline.

#### Scenario: Account has identity-origin matches
- **WHEN** `recordAnalysis` is called with a `FusionAccount` whose `isMatch` is true and `hasIdentityCandidateMatches` is true
- **THEN** the `FusionAccount` MUST be added to `tracker.matchAccounts`
- **AND** `tracker.fusionIdentityComparisonsByAccount` MUST be updated with the comparison count

---

### Requirement: Record managed account analysis for deferred matches
The `ManagedAccountAnalysisRecorder.recordAnalysis` method SHALL be called exactly once per managed account after the two-sweep analysis completes. It SHALL record deferred match candidates into `tracker.deferredMatchReportData` when report data capture is enabled and the account has deferred candidate matches but no identity-origin matches.

#### Scenario: Account has deferred candidate matches
- **WHEN** `recordAnalysis` is called with a `FusionAccount` whose `isMatch` is true, `hasIdentityCandidateMatches` is false, and matches have candidate type `Deferred`
- **THEN** `tracker.deferredMatchReportData` MUST receive a report account with `deferred: true`, comparison count, and mapped match candidates

---

### Requirement: Record managed account analysis for non-matches
The `ManagedAccountAnalysisRecorder.recordAnalysis` method SHALL be called exactly once per managed account after the two-sweep analysis completes. It SHALL record non-matching accounts into `tracker.analyzedNonMatchReportData` when report data capture is enabled. The method SHALL NOT receive a `deferredPhaseExecuted` parameter; the caller guarantees both analysis sweeps are complete before recording.

#### Scenario: Account does not match and report capture is enabled
- **WHEN** `recordAnalysis` is called with a non-matching account and report data capture is enabled
- **THEN** `tracker.analyzedNonMatchReportData` MUST receive a minimal fusion report account with comparison count and resolved report account id

#### Scenario: Account recorded once regardless of deferred status
- **WHEN** `recordAnalysis` is called with an account from a deferred-candidate-matching-enabled source that did not match in either sweep
- **THEN** the recorder MUST record the non-match exactly once
- **AND** the recorder MUST NOT check whether the account was deferred (the caller guarantees this)

---

### Requirement: Record failed matching
The `ManagedAccountAnalysisRecorder.trackFailed` method SHALL record a failed matching entry in `tracker.failedMatchingAccounts` when report data capture is enabled.

#### Scenario: Matching fails for an account
- **WHEN** `trackFailed` is called with a `FusionAccount` and an error message
- **THEN** a warning/error message MUST be logged
- **AND** `tracker.failedMatchingAccounts` MUST contain a minimal fusion report account with the error message and resolved report account id

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

