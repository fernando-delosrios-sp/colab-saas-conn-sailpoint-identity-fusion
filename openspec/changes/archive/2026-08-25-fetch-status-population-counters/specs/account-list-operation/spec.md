## MODIFIED Requirements

### Requirement: Fetch phase drives pipeline progress for heartbeat STATUS

During the account-list Fetch phase, long-running loads SHALL update Fetch population counters on `OperationRunContext` after each registration batch (managed-account page registration, fusion-account ingest chunk, identity ingest chunk) so STATUS lines show each inventory advancing between heartbeat ticks. Managed-account Fetch SHALL update `managed-accounts` using the aggregate registered count across in-flight managed sources. Fusion-account Fetch SHALL update `fusion-accounts`. Identity Fetch SHALL update `identities` when identity Fetch runs. When a census is known (for example from `X-Total-Count`), that counter's total SHALL reflect it; otherwise total MAY equal the running registered count. Fetch STATUS SHALL NOT use a single `progress=` unit of `fetched` or `ingested`. Pipeline progress deltas on STATUS SHALL be per population and SHALL remain independent of the api-queue completed delta.

#### Scenario: STATUS shows fetch progress during managed-account pagination

- **GIVEN** a persistent account-list operation in Fetch phase loading managed accounts across multiple pages
- **AND** at least one heartbeat interval elapses during fetch
- **WHEN** an operator reads STATUS lines
- **THEN** at least one STATUS line SHALL include `phase=Fetch` and `managed-accounts=`
- **AND** the managed-accounts `done` SHALL increase while pages are registered

#### Scenario: Fetch progress delta updates between batch-sized page groups

- **GIVEN** parallel managed-account pagination with page size 250 and heartbeat interval 10 seconds
- **AND** pages complete steadily through a sliding window
- **WHEN** multiple STATUS ticks occur during Fetch
- **THEN** managed-accounts `done` SHALL increase by less than a full window of pages between ticks when fewer than a full window of pages complete in the interval
- **AND** population counter deltas SHALL remain independent of the api-queue completed delta

#### Scenario: Fetch progress delta independent of api-queue delta

- **GIVEN** Fetch phase loads pages through the API queue
- **WHEN** a STATUS tick occurs mid-fetch
- **THEN** the line MAY show both a non-zero population-counter delta and a non-zero api-queue completed delta
- **AND** the two deltas SHALL remain separate fields on the STATUS line

#### Scenario: Fusion and managed counters do not overwrite each other

- **GIVEN** Fetch is loading Fusion accounts and managed accounts concurrently
- **AND** at least one heartbeat interval elapses
- **WHEN** an operator reads STATUS lines
- **THEN** a STATUS line MAY include both `fusion-accounts=` and `managed-accounts=`
- **AND** neither total SHALL replace the other
