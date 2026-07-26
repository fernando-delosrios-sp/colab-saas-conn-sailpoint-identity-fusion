## MODIFIED Requirements

### Requirement: OperationRunContext tracks run state for heartbeat consumption

The service registry SHALL expose an `OperationRunContext` updated by log service helpers (`phaseStart`, `phaseEnd`, `stepStart`, `stepEnd`, `setProgress`, `recordEvent`) and readable by the operation heartbeat within the active AsyncLocalStorage scope. The operation heartbeat SHALL track the previous pipeline progress `done` value alongside previous api-queue completed count for delta calculation. Automatic merge events SHALL be recorded under the category `autoMerged` (not `autoAssigned`).

#### Scenario: Progress update reflected in next STATUS line

- **GIVEN** a caller invokes `setProgress(450, 800, 'analyzed')`
- **WHEN** the next STATUS heartbeat fires
- **THEN** the STATUS line SHALL include `progress=450/800 analyzed`

#### Scenario: Progress delta uses previous tick baseline

- **GIVEN** progress was 450/800 at the previous STATUS tick
- **AND** a caller invokes `setProgress(570, 800, 'analyzed')` before the next tick
- **WHEN** the next STATUS heartbeat fires
- **THEN** the STATUS line SHALL include a pipeline progress delta of `+120` over the heartbeat interval

#### Scenario: Automatic merge events use autoMerged category

- **GIVEN** the match engine records one or more automatic merges via `recordEvent('autoMerged')`
- **WHEN** the heartbeat emits EVENT_SUMMARY
- **THEN** the summary SHALL include an automatic-merge count derived from `autoMerged` events
- **AND** the summary SHALL NOT reference `autoAssigned`
