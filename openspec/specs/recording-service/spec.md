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

RecordingService SHALL persist all ISC API request/response pairs through the active `RecordingStore`. The default NDJSON store SHALL write to `api-log.ndjson`. Each entry SHALL include the API getter name, method name, serialized arguments, serialized response, and timestamp.

#### Scenario: RecordingService persists api-log entries
- **WHEN** `RecordingService` is initialized in record mode
- **THEN** it SHALL provide an `onApiCall(entry: ApiLogEntry)` callback to `RecordingApiAdapter`
- **AND** each API call SHALL be persisted via the active `RecordingStore`

#### Scenario: Scenario.json includes api-log path
- **WHEN** `RecordingService.finalizeOnce()` compiles the scenario file
- **THEN** the scenario.json SHALL include an `apiLogPath` field referencing the api-log file
- **AND** manifest.json SHALL declare the store type and api-log entry count

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

When record mode is active and the aggregation report epilogue generates a report, the report payload SHALL be written to `reports/aggregation.json` in the chain recording directory. When matching results are persisted, they SHALL be written to `reports/matching-results.json` as a separate artifact. Email and ISC send behavior SHALL remain unchanged.

#### Scenario: Local aggregation report artifact written
- **GIVEN** a persistent account-list operation in record mode with aggregation report enabled
- **WHEN** the report epilogue generates the aggregation report successfully
- **THEN** the report payload SHALL be written to `reports/aggregation.json`

#### Scenario: Matching results and aggregation report coexist
- **GIVEN** a record-mode account-list operation that writes both artifacts
- **WHEN** finalize completes
- **THEN** both `reports/aggregation.json` and `reports/matching-results.json` MAY exist
- **AND** each SHALL be referenced independently in `manifest.json`

### Requirement: CJS finalize scripts SHALL preserve connector-written scenario config

When `finalize-chain-artifacts.cjs` rebuilds `scenario.json` from on-disk `steps.ndjson`, it MUST preserve the existing `config` object from a prior `scenario.json` if that config is non-empty. The CJS finalize path MUST NOT overwrite connector-written `FusionConfig` with an empty object.

#### Scenario: Re-finalize preserves config
- **GIVEN** `recordings/my-chain/scenario.json` exists with a non-empty `config.sources` array written by the connector
- **WHEN** `finalizeChainArtifacts('my-chain')` runs (e.g. from `record-chain.js` exit handler)
- **THEN** the rebuilt `scenario.json` retains the prior `config` object
- **AND** steps and reference values are refreshed from `steps.ndjson`

#### Scenario: First finalize without prior scenario uses empty config fallback
- **GIVEN** `recordings/my-chain/steps.ndjson` exists but no `scenario.json`
- **WHEN** `finalizeChainArtifacts('my-chain')` runs
- **THEN** `scenario.json` is written with `config: {}` as fallback
- **AND** steps are compiled from `steps.ndjson`

### Requirement: RecordingService SHALL persist matching results in record mode

When record mode is active and an account-list operation completes, RecordingService SHALL write a `reports/matching-results.json` file under the chain recording directory. The file SHALL contain identity matches, deferred matches (with per-attribute scores), analyzed non-matches, failed matching entries, and sweep summary counts when available. All payloads SHALL be JSON-serializable via `sanitizeForJson`.

#### Scenario: Matching results written after account-list in record mode
- **GIVEN** `config.recording.mode` is `'record'` and an account-list operation completes with populated tracker slices
- **WHEN** the account-list epilogue invokes matching-results persistence
- **THEN** `reports/matching-results.json` SHALL exist under the chain recording directory
- **AND** the file SHALL include `deferredMatches`, `nonMatches`, and `sweepSummary` fields

#### Scenario: Matching results omitted when not in record mode
- **GIVEN** `config.recording.mode` is `'off'` or `'replay'`
- **WHEN** an account-list operation completes
- **THEN** RecordingService SHALL NOT write `reports/matching-results.json`

---

### Requirement: Record mode SHALL enable managed-account report capture during account-list

When `config.recording.mode` is `'record'`, FusionService SHALL enable managed-account report data capture during account-list operations so `ManagedAccountAnalysisRecorder` populates tracker slices with score breakdowns.

#### Scenario: Tracker populated during record-mode account-list
- **GIVEN** a persistent account-list operation with `config.recording.mode = 'record'` and deferred matching enabled
- **WHEN** matching completes for managed accounts
- **THEN** `AggregationTracker.deferredMatchReportData` SHALL contain entries with per-attribute scores
- **AND** capture SHALL NOT require `fusionReportOnAggregation` or dry-run operation context

---

### Requirement: Manifest and scenario SHALL reference matching results path

When `reports/matching-results.json` exists at finalize time, `manifest.json` and `scenario.json` SHALL include a `matchingResultsPath` field referencing the file relative to the project root. The path SHALL appear in `manifest.artifactPaths`.

#### Scenario: Manifest declares matching results
- **GIVEN** a finalized recording with `reports/matching-results.json`
- **WHEN** `RecordingService.finalizeOnce()` completes
- **THEN** `manifest.json` SHALL include `matchingResultsPath`
- **AND** `artifactPaths` SHALL include the matching results path

#### Scenario: Scenario references matching results
- **GIVEN** a finalized recording with `reports/matching-results.json`
- **WHEN** `scenario.json` is compiled
- **THEN** `scenario.json` SHALL include `matchingResultsPath` referencing the artifact

---

