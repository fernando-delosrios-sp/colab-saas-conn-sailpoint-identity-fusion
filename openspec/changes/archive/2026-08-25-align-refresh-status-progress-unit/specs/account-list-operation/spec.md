## ADDED Requirements

### Requirement: Refresh phase drives pipeline progress for heartbeat STATUS

During the account-list Refresh phase, `processFusionAccounts` SHALL update `OperationRunContext` progress via `setProgress` at Fusion-account batch boundaries so STATUS lines show Refresh advancement between heartbeat ticks. Progress unit SHALL be `refreshed`. Progress `done`/`total` SHALL count Fusion accounts visited in that walk, not a `needsRefresh` subset. Process-phase `batchProcess` callers (identities, fusion identity decisions, correlated sweep) SHALL continue to use unit `processed` unless they pass a different unit.

#### Scenario: STATUS shows refreshed progress during Fusion-account Refresh

- **GIVEN** a persistent account-list operation in Refresh phase walking Fusion accounts
- **AND** at least one heartbeat interval elapses during that walk
- **WHEN** an operator reads STATUS lines
- **THEN** at least one STATUS line SHALL include `phase=Refresh` and `progress=` with unit `refreshed`
- **AND** pipeline progress delta SHALL increase while Fusion accounts complete batches

#### Scenario: Process batch progress unit stays processed

- **GIVEN** Process phase is walking identities or correlated managed accounts via `batchProcess` without an explicit progress unit
- **WHEN** `setProgress` is invoked from that helper
- **THEN** the progress unit SHALL be `processed`
- **AND** the helper SHALL NOT report those accounts as unit `refreshed`
