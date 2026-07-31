## ADDED Requirements

### Requirement: Replay mode SHALL NOT perform live ISC API calls

When `config.recording.mode` is `'replay'`, the connector MUST serve all ISC API interactions from recorded api-log entries via `ReplayApiAdapter`. `ServiceRegistry` MUST wire `ReplayApiAdapter` without a live `SdkApiAdapter` egress path and MUST fail fast if replay mode is active but a network-capable adapter would be invoked.

#### Scenario: Replay mode uses ReplayApiAdapter only

- **GIVEN** `config.recording.mode` is `'replay'`
- **WHEN** `ServiceRegistry` is constructed
- **THEN** the active ISC adapter MUST be `ReplayApiAdapter`
- **AND** no live ISC API call MUST be made during operation execution

#### Scenario: Unrecorded API call fails in replay

- **GIVEN** replay mode is active
- **WHEN** an operation attempts an ISC API call not present in the api-log
- **THEN** the connector MUST throw a clear replay drift error
- **AND** MUST NOT fall back to live tenant API calls

### Requirement: Replay CLI SHALL write replay-report.json

Each automated replay run MUST write `replay-report.json` to the scenario directory with per-step results, duration, drift details, and overall pass/fail status.

#### Scenario: Successful replay writes report

- **GIVEN** a scenario replay completes with all steps passing
- **WHEN** the replay orchestrator finishes
- **THEN** `replay-report.json` MUST exist in the scenario directory
- **AND** MUST record success for each executed step

### Requirement: npm run record SHALL be deprecated

The `npm run record` script MUST print a deprecation warning directing operators to capture scenarios via ISC External Settings (`externalRecordingEnabled` + `recordingName`). The script MAY remain functional for one release as a dev escape hatch.

#### Scenario: Record script prints deprecation warning

- **WHEN** a developer runs `npm run record`
- **THEN** a deprecation warning MUST be printed before the connector starts
- **AND** the warning MUST reference External Settings as the canonical capture path

## MODIFIED Requirements

### Requirement: Recording configuration SHALL be centralized in RecordingConfig

All recording configuration SHALL flow through a `RecordingConfig` object on `FusionConfig`, resolved by `resolveRecordingConfig()` during config load. No recording-related environment variable SHALL be read directly by `RecordingService` or `FusionRun`. Environment variables `RECORD_MODE`, `RECORD_SCENARIO_NAME`, `RECORD_CHAIN_NAME` (deprecated alias), and `VERBOSE_RECORDING` SHALL be consumed only by `resolveRecordingConfig()` as fallbacks when explicit config fields are unset. When External Settings enables recording with a `recordingName`, that name SHALL be supplied to `resolveRecordingConfig()` as `scenarioName` (with `chainName` accepted as a deprecated alias) before env-var fallbacks apply.

#### Scenario: RecordingConfig on FusionConfig

- **WHEN** `FusionConfig` is constructed with recording settings
- **THEN** `config.recording` SHALL contain `{ mode, scenarioName?, verbose?, store? }`
- **AND** `RecordingService` SHALL read scenario name, verbosity, and store type from config, not from `process.env`

#### Scenario: ServiceRegistry wires adapters from config

- **WHEN** `ServiceRegistry` is constructed with `config.recording.mode = 'record'`
- **THEN** it SHALL wire `RecordingApiAdapter` wrapping `SdkApiAdapter`
- **WHEN** `config.recording.mode = 'replay'`
- **THEN** it SHALL wire `ReplayApiAdapter` loaded from the api-log path
- **WHEN** `config.recording.mode` is `'off'` or undefined after resolution
- **THEN** it SHALL wire `SdkApiAdapter` directly (no change from current behavior)

#### Scenario: ISC recording name supplies chainName

- **REMOVED** — renamed to **ISC recording name supplies scenarioName**; `chainName` retained as deprecated alias.

#### Scenario: ISC recording name supplies scenarioName

- **GIVEN** External Settings recording is enabled with `recordingName: 'prod-baseline'`
- **WHEN** `safeReadConfig()` resolves recording configuration
- **THEN** `config.recording.scenarioName` MUST be `'prod-baseline'` before env fallbacks

### Requirement: Recording configuration SHALL resolve from env vars via resolveRecordingConfig

Recording configuration SHALL be resolved by `resolveRecordingConfig()` during `safeReadConfig()`. When `config.recording.mode` is not explicitly set, `RECORD_MODE=true` SHALL set `mode` to `'record'` and MUST log a deprecation warning. When `scenarioName` is not set, `RECORD_SCENARIO_NAME` SHALL be used; `RECORD_CHAIN_NAME` SHALL be accepted as a deprecated alias with a deprecation warning. When `verbose` is not set, `VERBOSE_RECORDING=true` SHALL set `verbose` to true. Explicit config values SHALL take precedence over environment variables.

#### Scenario: Env vars activate record mode when config mode unset

- **GIVEN** `process.env.RECORD_MODE` is `'true'` and platform config has no `recording.mode`
- **WHEN** `safeReadConfig()` completes
- **THEN** `config.recording.mode` SHALL be `'record'`
- **AND** a deprecation warning MUST be logged for `RECORD_MODE`

#### Scenario: Explicit config overrides env vars

- **GIVEN** `process.env.RECORD_MODE` is `'true'` and platform config sets `recording.mode` to `'off'`
- **WHEN** `safeReadConfig()` completes
- **THEN** `config.recording.mode` SHALL be `'off'`
- **AND** `RecordingService` SHALL NOT be initialized

### Requirement: ISC External Settings SHALL activate record mode with a named scenario

When `externalProcessingEnabled`, `externalProxyEnabled`, and `externalRecordingEnabled` are all true and `recordingName` is non-empty, `safeReadConfig()` MUST set `config.recording.mode` to `'record'` and `config.recording.scenarioName` to `recordingName` unless explicit `recording.mode` or env-var resolution already overrides those values per existing precedence rules. External Settings MUST be documented as the canonical operator path for scenario capture.

#### Scenario: External Settings recording name activates record mode

- **GIVEN** platform config has `externalProcessingEnabled: true`, `externalProxyEnabled: true`, `externalRecordingEnabled: true`, and `recordingName: 'prod-baseline'`
- **AND** no explicit `recording.mode` is set in platform config
- **AND** `RECORD_MODE` env var is not set
- **WHEN** `safeReadConfig()` completes
- **THEN** `config.recording.mode` MUST be `'record'`
- **AND** `config.recording.scenarioName` MUST be `'prod-baseline'`

#### Scenario: Recording requires proxy sub-option in config validation

- **GIVEN** `externalProcessingEnabled` is `true` and `externalRecordingEnabled` is `true`
- **AND** `externalProxyEnabled` is `false`
- **WHEN** `safeReadConfig()` is invoked
- **THEN** config validation MUST fail with a clear error

#### Scenario: Env vars retain precedence over ISC recording name

- **GIVEN** platform config enables external recording with `recordingName: 'ui-scenario'`
- **AND** platform config sets `recording.mode` to `'off'`
- **WHEN** `safeReadConfig()` completes
- **THEN** `config.recording.mode` MUST be `'off'`
- **AND** `RecordingService` MUST NOT be initialized

### Requirement: Recording scenario directories SHALL be tenant-scoped on disk

When `RecordingService` writes scenario artifacts in record mode, the scenario directory MUST be rooted at `recordings/<tenant>/{scenarioName}/` where `<tenant>` is the filesystem-safe slug derived from connection `baseurl` using the same rules as log-service tenant slug derivation. The tenant subdirectory MUST be created automatically before the first write. Repo-relative paths embedded in manifests and `scenario.json` MUST use the matching `recordings/<tenant>/{scenarioName}` form.

#### Scenario: Record mode writes under tenant subdirectory

- **GIVEN** `config.recording.mode` is `'record'`
- **AND** `config.recording.scenarioName` is `'prod-baseline'`
- **AND** connection `baseurl` is `https://acme.api.identitynow.com`
- **WHEN** `RecordingService` persists scenario artifacts
- **THEN** files MUST be written under `recordings/acme/prod-baseline/`

#### Scenario: Two tenants with the same chain name do not collide

- **REMOVED** — renamed to **Two tenants with the same scenario name do not collide**.

#### Scenario: Two tenants with the same scenario name do not collide

- **GIVEN** two tenants record a scenario named `baseline` on the same host
- **WHEN** artifacts are persisted
- **THEN** each tenant MUST write under a distinct `recordings/<tenant>/baseline/` directory

#### Scenario: Replay resolves tenant-scoped chain directory

- **REMOVED** — superseded by replay path resolution using `scenarioName` (deprecated `chainName` alias) under the same tenant-scoped layout.

#### Scenario: Missing baseurl uses unknown-tenant recording root

- **GIVEN** `config.recording.mode` is `'record'`
- **AND** connection `baseurl` is missing or unparseable
- **WHEN** `RecordingService` persists scenario artifacts for scenario `'local-test'`
- **THEN** files MUST be written under `recordings/unknown-tenant/local-test/`

## RENAMED Requirements

- FROM: `### Requirement: ISC External Settings SHALL activate record mode with a named chain`
- TO: `### Requirement: ISC External Settings SHALL activate record mode with a named scenario`

- FROM: `### Requirement: Recording chain directories SHALL be tenant-scoped on disk`
- TO: `### Requirement: Recording scenario directories SHALL be tenant-scoped on disk`
