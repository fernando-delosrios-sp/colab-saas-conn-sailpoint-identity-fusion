## MODIFIED Requirements

### Requirement: Account-list operation runs an operation heartbeat

The account-list operation SHALL start an operation heartbeat at the beginning of the run and stop it in a `finally` block so the heartbeat is active for the full pipeline and epilogue. The heartbeat SHALL use the configured `statsLoggingIntervalMs` interval from Advanced Connection Settings (default 10 seconds).

#### Scenario: Heartbeat active for entire account-list run

- **GIVEN** a persistent account-list aggregation begins
- **WHEN** the pipeline executes through Output and the report epilogue
- **THEN** STATUS heartbeat lines SHALL be emitted at the configured interval throughout the run
- **AND** the heartbeat SHALL stop when the operation handler completes

#### Scenario: Heartbeat stopped on pipeline failure

- **GIVEN** the account-list pipeline fails during Process phase
- **WHEN** the report epilogue runs and the operation rethrows the error
- **THEN** the heartbeat SHALL still have emitted STATUS lines up to the failure window
- **AND** the heartbeat SHALL stop in `finally` without leaking the interval

#### Scenario: Default 10 second interval for account-list heartbeat

- **GIVEN** a source configuration with default Advanced Connection Settings
- **WHEN** a persistent account-list aggregation runs for more than 10 seconds
- **THEN** at least one STATUS heartbeat line SHALL appear within the first 10 seconds
