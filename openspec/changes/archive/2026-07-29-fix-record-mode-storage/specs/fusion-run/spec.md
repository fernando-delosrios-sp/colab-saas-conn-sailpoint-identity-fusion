## MODIFIED Requirements

### Requirement: FusionRun holds operation execution mode state

FusionRun SHALL contain boolean properties denoting the global execution mode of the run, specifically whether the run is executing in record mode (`isRecordMode`). Record mode SHALL be derived from the resolved `config.recording.mode === 'record'` passed to the constructor. FusionRun SHALL NOT read `process.env.RECORD_MODE` directly. Environment variables `RECORD_MODE`, `RECORD_CHAIN_NAME`, and `VERBOSE_RECORDING` SHALL be consumed only by `resolveRecordingConfig()` during config load.

#### Scenario: FusionRun derives isRecordMode from resolved config
- **WHEN** `FusionRun` is constructed with `config.recording.mode = 'record'`
- **THEN** `isRecordMode` SHALL be `true`

#### Scenario: FusionRun is not in record mode when config mode is off
- **WHEN** `FusionRun` is constructed with `config.recording.mode = 'off'` regardless of `RECORD_MODE` env
- **THEN** `isRecordMode` SHALL be `false`

#### Scenario: FusionRun evaluates environment variables on initialization
- **WHEN** `FusionRun` is constructed
- **THEN** it SHALL NOT read `process.env.RECORD_MODE`
- **AND** `isRecordMode` SHALL reflect only the resolved `config.recording.mode` passed to the constructor
