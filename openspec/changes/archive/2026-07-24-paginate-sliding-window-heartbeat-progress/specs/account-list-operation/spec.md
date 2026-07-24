## MODIFIED Requirements

### Requirement: Fetch phase drives pipeline progress for heartbeat STATUS

During the account-list Fetch phase, long-running paginated loads SHALL update `OperationRunContext` progress via `setProgress` after each page completes (or at equivalent pagination boundaries for non-page modes) so STATUS lines show fetch advancement between heartbeat ticks. Progress unit SHALL be `fetched`. When the pagination layer knows a total item count (for example from `X-Total-Count`), progress total SHALL reflect that count; otherwise total MAY equal the running loaded count until a total becomes known. Pipeline progress delta on STATUS SHALL reflect per-page advancement during parallel managed-account fetch, not only multi-page batch jumps.

#### Scenario: STATUS shows fetch progress during managed-account pagination

- **GIVEN** a persistent account-list operation in Fetch phase loading managed accounts across multiple pages
- **AND** at least one heartbeat interval elapses during fetch
- **WHEN** an operator reads STATUS lines
- **THEN** at least one STATUS line SHALL include `phase=Fetch` and `progress=` with unit `fetched`
- **AND** pipeline progress delta SHALL increase while pages are loaded

#### Scenario: Fetch progress delta updates between batch-sized page groups

- **GIVEN** parallel managed-account pagination with page size 250 and heartbeat interval 10 seconds
- **AND** pages complete steadily through a sliding window
- **WHEN** multiple STATUS ticks occur during Fetch
- **THEN** pipeline progress `done` SHALL increase by less than a full window of pages between ticks when fewer than a full window of pages complete in the interval
- **AND** pipeline progress delta SHALL remain independent of the api-queue completed delta

#### Scenario: Fetch progress delta independent of api-queue delta

- **GIVEN** Fetch phase loads pages through the API queue
- **WHEN** a STATUS tick occurs mid-fetch
- **THEN** the line MAY show both a non-zero pipeline progress delta and a non-zero api-queue completed delta
- **AND** the two deltas SHALL remain separate fields on the STATUS line
