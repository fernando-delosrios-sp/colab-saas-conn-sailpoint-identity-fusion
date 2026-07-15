# logService Spec

## Purpose

The log service (`src/services/logService/`) is the connector's logging facade. It defines the `LogService` interface, the SDK adapter that writes to the connector host, and the helper utilities used elsewhere in the codebase to log structured events, known operation function names, and a small set of standardized debug/warn patterns. This spec defines the contract for what the rest of the connector can assume about the log surface (level, structured fields, redaction) and what the host receives.

## Requirements

### Requirement: The log service MUST expose a stable, structured log surface

The log service MUST expose a `LogService` interface with the standard levels (`debug`, `info`, `warn`, `error`) and structured-field support. The SDK adapter MUST forward every call to the connector host without lossy transformation. Known operation function names MUST be recorded as structured fields, not free-form strings, so downstream tooling can index them.

#### Scenario: A log call reaches the connector host

- **GIVEN** a caller invokes `log.info('account.created', { id: 'acct-1' })`
- **WHEN** the host processes the event
- **THEN** the host sees one event with message `'account.created'` and a structured field `id: 'acct-1'`
- **AND** the event is at the `info` level

#### Scenario: Known operation names are emitted as structured fields

- **GIVEN** a caller invokes `log.debug('op.start', { op: 'std:account:read' })`
- **WHEN** the host indexes the event
- **THEN** the operation name is available as a first-class field, not embedded in the message string
