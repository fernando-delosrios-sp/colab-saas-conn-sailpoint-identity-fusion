## ADDED Requirements

### Requirement: ISC External Settings SHALL activate record mode with a named chain

When `externalProcessingEnabled`, `externalProxyEnabled`, and `externalRecordingEnabled` are all true and `recordingName` is non-empty, `safeReadConfig()` MUST set `config.recording.mode` to `'record'` and `config.recording.chainName` to `recordingName` unless explicit `recording.mode` or env-var resolution already overrides those values per existing precedence rules.

#### Scenario: External Settings recording name activates record mode

- **GIVEN** platform config has `externalProcessingEnabled: true`, `externalProxyEnabled: true`, `externalRecordingEnabled: true`, and `recordingName: 'prod-baseline'`
- **AND** no explicit `recording.mode` is set in platform config
- **AND** `RECORD_MODE` env var is not set
- **WHEN** `safeReadConfig()` completes
- **THEN** `config.recording.mode` MUST be `'record'`
- **AND** `config.recording.chainName` MUST be `'prod-baseline'`

#### Scenario: Recording requires proxy sub-option in config validation

- **GIVEN** `externalProcessingEnabled` is `true` and `externalRecordingEnabled` is `true`
- **AND** `externalProxyEnabled` is `false`
- **WHEN** `safeReadConfig()` is invoked
- **THEN** config validation MUST fail with a clear error

#### Scenario: Env vars retain precedence over ISC recording name

- **GIVEN** platform config enables external recording with `recordingName: 'ui-chain'`
- **AND** platform config sets `recording.mode` to `'off'`
- **WHEN** `safeReadConfig()` completes
- **THEN** `config.recording.mode` MUST be `'off'`
- **AND** `RecordingService` MUST NOT be initialized

## MODIFIED Requirements

### Requirement: Recording configuration SHALL be centralized in RecordingConfig

All recording configuration SHALL flow through a `RecordingConfig` object on `FusionConfig`, resolved by `resolveRecordingConfig()` during config load. No recording-related environment variable SHALL be read directly by `RecordingService` or `FusionRun`. Environment variables `RECORD_MODE`, `RECORD_CHAIN_NAME`, and `VERBOSE_RECORDING` SHALL be consumed only by `resolveRecordingConfig()` as fallbacks when explicit config fields are unset. When External Settings enables recording with a `recordingName`, that name SHALL be supplied to `resolveRecordingConfig()` as `chainName` before env-var fallbacks apply.

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

#### Scenario: ISC recording name supplies chainName

- **GIVEN** External Settings recording is enabled with `recordingName: 'my-chain'`
- **WHEN** `safeReadConfig()` resolves recording configuration
- **THEN** `config.recording.chainName` MUST be `'my-chain'` before `RECORD_CHAIN_NAME` env fallback
