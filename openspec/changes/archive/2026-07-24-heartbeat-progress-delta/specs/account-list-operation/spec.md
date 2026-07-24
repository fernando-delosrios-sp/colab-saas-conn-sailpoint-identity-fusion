## ADDED Requirements

### Requirement: Fetch phase drives pipeline progress for heartbeat STATUS

During the account-list Fetch phase, long-running paginated loads SHALL update `OperationRunContext` progress via `setProgress` at page or batch boundaries so STATUS lines show fetch advancement between heartbeat ticks. Progress unit SHALL be `fetched`. When the pagination layer knows a total item count (for example from `X-Total-Count`), progress total SHALL reflect that count; otherwise total MAY equal the running loaded count until a total becomes known.

#### Scenario: STATUS shows fetch progress during managed-account pagination

- **GIVEN** a persistent account-list operation in Fetch phase loading managed accounts across multiple pages
- **AND** at least one heartbeat interval elapses during fetch
- **WHEN** an operator reads STATUS lines
- **THEN** at least one STATUS line SHALL include `phase=Fetch` and `progress=` with unit `fetched`
- **AND** pipeline progress delta SHALL increase while pages are loaded

#### Scenario: Fetch progress delta independent of api-queue delta

- **GIVEN** Fetch phase loads pages through the API queue
- **WHEN** a STATUS tick occurs mid-fetch
- **THEN** the line MAY show both a non-zero pipeline progress delta and a non-zero api-queue completed delta
- **AND** the two deltas SHALL remain separate fields on the STATUS line
