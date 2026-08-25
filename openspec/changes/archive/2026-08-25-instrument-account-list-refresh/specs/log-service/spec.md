## ADDED Requirements

### Requirement: Operation run context exposes Refresh phase metrics

`OperationRunContext` SHALL expose methods to reset, record, and flush Refresh-phase aggregate metrics. Recording SHALL occur only when the active operation phase is `Refresh`. Flushed summaries SHALL use low-cardinality numeric fields suitable for DETAIL log lines.

#### Scenario: Metrics reset at Refresh start

- **GIVEN** a previous operation phase recorded Refresh metrics
- **WHEN** Refresh phase begins a new account-list run
- **THEN** Refresh metrics counters SHALL be zeroed before the first `processFusionAccount` call

#### Scenario: Flush returns undefined when no accounts processed

- **GIVEN** Refresh metrics were reset and no sub-step recordings occurred
- **WHEN** flush is invoked
- **THEN** the result SHALL be undefined
