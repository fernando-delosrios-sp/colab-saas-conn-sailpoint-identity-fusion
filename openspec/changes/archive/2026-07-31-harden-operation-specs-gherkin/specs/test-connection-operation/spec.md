## REMOVED Requirements

### Requirement: Test connection validates connector initialization

**Reason**: Replaced with conditional validation scenarios aligned to implementation.

**Migration**: Use ADDED requirements in this change.

## ADDED Requirements

### Requirement: Test connection validates sources and JMESPath filters

The test-connection operation SHALL fetch all configured sources and validate account JMESPath filters before returning success.

#### Scenario: Sources and JMESPath validation succeed

- **GIVEN** a valid connector configuration with reachable ISC APIs
- **WHEN** the test-connection operation is invoked
- **THEN** the connector SHALL fetch all sources
- **AND** SHALL validate configured account JMESPath filters without error

#### Scenario: JMESPath validation failure propagates

- **GIVEN** a connector configuration with an invalid account JMESPath filter
- **WHEN** the test-connection operation is invoked
- **THEN** the operation SHALL fail and propagate the validation error to the platform

### Requirement: Test connection conditionally validates email workflow sender

When email workflow delivery is configured, the test-connection operation SHALL validate that the email workflow sender is reachable.

#### Scenario: Email workflow sender validated when configured

- **GIVEN** email workflow delivery is configured for the connector
- **WHEN** the test-connection operation is invoked
- **THEN** the connector SHALL fetch and validate the email workflow sender

#### Scenario: Email workflow sender skipped when not configured

- **GIVEN** email workflow delivery is not configured
- **WHEN** the test-connection operation is invoked
- **THEN** the connector SHALL NOT fetch the email workflow sender

### Requirement: Test connection conditionally validates delayed-aggregation workflow sender

When one or more managed sources use delayed aggregation, the test-connection operation SHALL validate the delayed-aggregation workflow sender.

#### Scenario: Delayed-aggregation sender validated when sources require delay

- **GIVEN** at least one managed source configured with aggregation delay
- **WHEN** the test-connection operation is invoked
- **THEN** the connector SHALL fetch and validate the delayed-aggregation workflow sender

#### Scenario: Delayed-aggregation sender skipped when no delayed sources

- **GIVEN** no managed sources configured with aggregation delay
- **WHEN** the test-connection operation is invoked
- **THEN** the connector SHALL NOT fetch the delayed-aggregation workflow sender

### Requirement: Test connection conditionally validates reverse-correlation setup per source

When managed sources use reverse correlation, the test-connection operation SHALL validate reverse-correlation setup for each such source and SHALL fail with a source-scoped error message when validation fails.

#### Scenario: Reverse-correlation setup validated per reverse source

- **GIVEN** at least one managed source with `correlationMode: reverse`
- **WHEN** the test-connection operation is invoked
- **THEN** the connector SHALL validate reverse-correlation setup for each reverse-correlation source

#### Scenario: Reverse-correlation validation failure names source and attribute

- **GIVEN** a reverse-correlation source whose setup validation fails
- **WHEN** the test-connection operation is invoked
- **THEN** the operation SHALL fail with an error message naming the source and correlation attribute

### Requirement: Test connection returns empty object on success

When all applicable validations pass, the test-connection operation SHALL return an empty object via `res.send({})`.

#### Scenario: Successful test connection response

- **GIVEN** all applicable validations pass
- **WHEN** the test-connection operation completes
- **THEN** the connector SHALL send `{}` as the operation result
