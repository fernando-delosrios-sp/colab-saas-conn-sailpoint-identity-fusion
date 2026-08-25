## ADDED Requirements

### Requirement: processFusionAccount records Refresh sub-step metrics

When the bound operation run context phase is `Refresh`, `FusionService.processFusionAccount` SHALL record wall-clock durations into Refresh-phase aggregate buckets (`prelude`, `managedLayer`, `uniqueRegister`, `map`, `normalDefine`, `correlation`, `finalize`) without emitting per-account METRIC or INFO lines for those sub-steps. When the phase is not `Refresh`, the same recipe SHALL run and Refresh-phase metrics SHALL NOT increment.

#### Scenario: Refresh phase records sub-step timings without per-account METRIC

- **GIVEN** `processFusionAccount` runs during account-list Refresh
- **WHEN** the extended account-assembly recipe completes for a Fusion account
- **THEN** Refresh-phase metrics SHALL include the sub-step durations for that account
- **AND** the connector SHALL NOT emit a METRIC line per Fusion account for those sub-steps

#### Scenario: Non-Refresh processFusionAccount does not increment Refresh metrics

- **GIVEN** `processFusionAccount` is invoked during Process phase or a single-account rebuild
- **WHEN** sub-step timing hooks execute
- **THEN** Refresh-phase metrics SHALL NOT increment
