## ADDED Requirements

### Requirement: Log level SHALL be configurable in Advanced Settings Log Settings

The connector SHALL expose a **Log level** setting (`logLevel`) in a **Log Settings** section under Advanced Settings. The setting SHALL be a radio with options `error`, `warn`, `info`, and `debug`. When no value is stored, the effective Log level SHALL be `info`. The stored value SHALL be read into `FusionConfig` during configuration bootstrap, and any value outside the allowed set SHALL fall back to `info` without throwing.

#### Scenario: Default Log level when setting omitted

- **GIVEN** a source configuration with no `logLevel` value
- **WHEN** configuration is read
- **THEN** the effective Log level SHALL be `info`

#### Scenario: Custom Log level from Log Settings

- **GIVEN** a source configuration with `logLevel` set to `warn`
- **WHEN** configuration is read
- **THEN** the effective Log level SHALL be `warn`

#### Scenario: Invalid stored Log level falls back to info

- **GIVEN** a source configuration with `logLevel` set to `verbose`
- **WHEN** configuration is read
- **THEN** the effective Log level SHALL be `info`
- **AND** configuration reading SHALL NOT throw

#### Scenario: Setting appears in connector-spec Advanced Settings

- **GIVEN** an operator views Advanced Settings in the connector UI
- **WHEN** the **Log Settings** section renders
- **THEN** a **Log level** radio keyed `logLevel` SHALL be present
- **AND** its options SHALL be Error, Warn, Info, and Debug
- **AND** the documented default SHALL be Info

### Requirement: Host log emission SHALL be gated by the configured Log level before message construction

`LogService` SHALL compare each message level against the effective Log level using priority `debug < info < warn < error`. When a message level is below the effective Log level, the service SHALL NOT format the message, capture caller origin, or call the connector-host logger for that message. When a message level is at or above the effective Log level, host output SHALL be unchanged.

#### Scenario: Below-level message is neither built nor emitted

- **GIVEN** the effective Log level is `warn`
- **WHEN** a caller invokes `log.debug('detail')` or `log.info('status')`
- **THEN** the connector host SHALL NOT receive a DEBUG or INFO event
- **AND** the service SHALL NOT build the message string or capture caller origin for that call

#### Scenario: At-or-above-level message is emitted

- **GIVEN** the effective Log level is `info`
- **WHEN** a caller invokes `log.info('PHASE 4 Process START')`
- **THEN** the connector host SHALL receive the INFO event as before

#### Scenario: Assertion path honors the gate

- **GIVEN** the effective Log level is `error`
- **WHEN** `log.assert(false, 'check failed', undefined, 'warn')` is invoked
- **THEN** the connector host SHALL NOT receive a WARN event

#### Scenario: Crash always emits at error

- **GIVEN** the effective Log level is `error`
- **WHEN** `log.crash('fatal')` is invoked
- **THEN** the connector host SHALL receive an ERROR event
- **AND** a `ConnectorError` SHALL be thrown

### Requirement: Platform debug toggle SHALL force the debug Log level

When `spConnDebugLoggingEnabled` is `true`, the effective Log level SHALL be `debug` regardless of the stored `logLevel`. When it is `false` or absent, the stored `logLevel` SHALL apply. Setting the level SHALL keep the connector-host logger level in sync.

#### Scenario: Debug toggle overrides a more restrictive selection

- **GIVEN** `logLevel` is `error`
- **AND** `spConnDebugLoggingEnabled` is `true`
- **WHEN** `LogService` is constructed
- **THEN** the effective Log level SHALL be `debug`

#### Scenario: Selected level applies when debug toggle is off

- **GIVEN** `logLevel` is `warn`
- **AND** `spConnDebugLoggingEnabled` is `false`
- **WHEN** `LogService` is constructed
- **THEN** the effective Log level SHALL be `warn`

### Requirement: Aggregation issue summary SHALL be independent of the Log level

Counts and samples recorded for WARN and ERROR messages SHALL be tracked regardless of the effective Log level, so that lowering host verbosity does not change aggregation issue summaries.

#### Scenario: Warn and error counts tracked below the host level

- **GIVEN** the effective Log level is `error`
- **WHEN** `log.warn('slow request')` is invoked
- **THEN** the connector host SHALL NOT receive a WARN event
- **AND** the aggregation issue summary warning count SHALL increase by one

### Requirement: Log level SHALL NOT suppress messages wanted by an active external logging sink

Host emission SHALL be gated by the Log level, while external delivery SHALL remain gated by `externalLoggingLevel`. A message below the Log level SHALL still be built and delivered when an active external route admits it. A message below the Log level SHALL be skipped entirely when no active external route admits it.

#### Scenario: External sink admits a below-host-level message

- **GIVEN** the effective Log level is `error`
- **AND** external logging is active with `externalLoggingLevel` `debug`
- **WHEN** a caller invokes `log.debug('external detail')`
- **THEN** the external sink SHALL receive the DEBUG message
- **AND** the connector host SHALL NOT receive a DEBUG event

#### Scenario: No external sink skips the below-level message

- **GIVEN** the effective Log level is `error`
- **AND** external logging is inactive
- **WHEN** a caller invokes `log.info('status')`
- **THEN** neither the connector host nor an external sink SHALL receive the message
