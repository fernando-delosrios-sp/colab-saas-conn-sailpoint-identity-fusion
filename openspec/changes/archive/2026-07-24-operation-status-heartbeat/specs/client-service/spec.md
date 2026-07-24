## ADDED Requirements

### Requirement: Queue statistics are consumed by operation heartbeat not standalone logging

The client service SHALL expose queue statistics and active item information via `getQueueStats()` and `getQueueItems()` for operation heartbeat consumption. The client service SHALL NOT emit standalone periodic `Queue Stats:` log lines when an operation heartbeat is active for the current registry context.

#### Scenario: No standalone queue stats interval during account-list

- **GIVEN** an account-list operation with an active operation heartbeat
- **WHEN** the run exceeds two heartbeat intervals
- **THEN** log output SHALL NOT contain standalone lines beginning with `Queue Stats:`
- **AND** queue statistics SHALL appear inside `STATUS` heartbeat lines instead

#### Scenario: Queue stats API remains available

- **GIVEN** any connector operation using the shared API queue
- **WHEN** a caller invokes `client.getQueueStats()`
- **THEN** current queue statistics SHALL be returned regardless of heartbeat state
