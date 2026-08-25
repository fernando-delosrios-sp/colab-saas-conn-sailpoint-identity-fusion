## ADDED Requirements

### Requirement: Refresh phase records aggregate sub-step workload metrics

During account-list Refresh phase, the connector SHALL accumulate per-sub-step timing and workload counters while processing persisted Fusion accounts via `FusionService.processFusionAccount`. Sub-step buckets SHALL include at minimum: `prelude`, `managedLayer`, `uniqueRegister`, `map`, `normalDefine`, `correlation`, and `finalize`. Metrics SHALL aggregate across all Refresh accounts in the run. The connector SHALL NOT emit per-account METRIC or INFO lines for these sub-steps.

#### Scenario: Refresh emits aggregate workload summary

- **GIVEN** a persistent account-list operation processes at least one Fusion account during Refresh
- **WHEN** Refresh phase completes
- **THEN** the connector host SHALL receive one DETAIL line with action `refresh workload`
- **AND** the line SHALL include total Refresh account count and per-bucket millisecond totals

#### Scenario: Sub-step metrics recorded only during Refresh

- **GIVEN** `processFusionAccount` is invoked during Process phase or account-read rebuild
- **WHEN** sub-step timing hooks execute
- **THEN** Refresh-phase metrics SHALL NOT increment
- **AND** aggregation behavior SHALL remain unchanged

#### Scenario: Empty Refresh skips workload summary

- **GIVEN** Refresh phase completes with zero Fusion accounts processed
- **WHEN** metrics are flushed
- **THEN** no `refresh workload` DETAIL line SHALL be emitted

### Requirement: Map and Normal Define sub-steps are measured separately

When Refresh records attribute-processing time, Map (`MappingService.mapAttributes`) and Normal Define (`DefinitionService.refreshNormalAttributes`) SHALL contribute to distinct sub-step buckets `map` and `normalDefine` rather than a single combined timer.

#### Scenario: Map and Define buckets appear in workload summary

- **GIVEN** at least one Fusion account with `needsRefresh` true during Refresh
- **WHEN** Refresh workload summary is emitted
- **THEN** the summary SHALL include separate `mapMs` and `normalDefineMs` fields (or equivalent keys)
- **AND** both values SHALL be greater than zero when attribute processing ran
