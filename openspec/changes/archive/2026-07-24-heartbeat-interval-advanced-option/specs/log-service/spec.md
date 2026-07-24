## ADDED Requirements

### Requirement: Heartbeat interval is configurable in Advanced Connection Settings

The connector SHALL expose a **Heartbeat interval (seconds)** setting (`heartbeatInterval`) in Advanced Connection Settings. The setting SHALL default to 10 seconds when unset. At runtime the connector SHALL convert the configured value to milliseconds and expose it as `statsLoggingIntervalMs` on `FusionConfig` for operation heartbeat consumption.

#### Scenario: Default heartbeat interval when setting omitted

- **GIVEN** a source configuration with no `heartbeatInterval` value
- **WHEN** `safeReadConfig` completes
- **THEN** `statsLoggingIntervalMs` SHALL be 10000

#### Scenario: Custom heartbeat interval from advanced settings

- **GIVEN** a source configuration with `heartbeatInterval` set to 30
- **WHEN** `safeReadConfig` completes
- **THEN** `statsLoggingIntervalMs` SHALL be 30000

#### Scenario: Setting appears in connector-spec Advanced Connection Settings

- **GIVEN** an operator views Advanced Connection Settings in the connector UI
- **WHEN** the section renders
- **THEN** a **Heartbeat interval (seconds)** field keyed `heartbeatInterval` SHALL be present
- **AND** the documented default SHALL be 10 seconds

## MODIFIED Requirements

### Requirement: Operation heartbeat emits periodic STATUS lines

The log service SHALL provide an operation heartbeat that emits a `STATUS` text line at a configurable interval while an operation heartbeat is active. The interval SHALL be `statsLoggingIntervalMs` from Advanced Connection Settings (configured as `heartbeatInterval` in seconds in the connector UI; default 10 seconds). Each `STATUS` line SHALL include, when available: current phase, current step, progress (`done/total`), operation elapsed time, API queue statistics with processed-count delta since the previous tick, and process memory (RSS and heap used).

#### Scenario: STATUS line during account-list Process phase

- **GIVEN** an account-list operation in Process phase with step `uncorrelated-sweep` and progress 537/800
- **WHEN** the operation heartbeat interval fires
- **THEN** the connector host SHALL receive an INFO line prefixed with `[accountList] STATUS`
- **AND** the line SHALL include `phase=Process`, `step=uncorrelated-sweep`, and `progress=537/800`

#### Scenario: STATUS includes queue delta

- **GIVEN** the API queue processed count was 537 at the previous STATUS tick and remains 537
- **WHEN** the next STATUS line is emitted
- **THEN** the line SHALL include `processed=537` and a delta indicating zero completions since the previous tick

#### Scenario: Default 10 second heartbeat interval

- **GIVEN** a source configuration with default Advanced Connection Settings (no explicit `heartbeatInterval`)
- **WHEN** an account-list operation runs longer than 10 seconds
- **THEN** at least one STATUS line SHALL be emitted within the first 10 seconds of the operation heartbeat
