## ADDED Requirements

### Requirement: STATUS SHALL render ingested progress the same way as fetched

When `log.setProgress` is invoked with unit `ingested`, the operation heartbeat SHALL include that progress on the STATUS line in the same shape as other units: `progress={done}/{total} ingested` with an optional delta suffix after the first tick. The heartbeat SHALL NOT emit a separate `INGEST` line kind. A DETAIL line MAY accompany ingest start; per-chunk INFO progress lines SHALL NOT be required.

#### Scenario: Ingested unit appears on STATUS like Fetch fetched

- **GIVEN** Fetch phase bulk ingest has called `setProgress(2500, 10000, 'ingested')`
- **WHEN** the operation heartbeat interval fires
- **THEN** the connector host SHALL receive an INFO STATUS line
- **AND** the line SHALL include `progress=2500/10000 ingested`

#### Scenario: Ingested progress delta uses previous tick baseline

- **GIVEN** progress was 2500/10000 ingested at the previous STATUS tick
- **AND** a caller invokes `setProgress(4000, 10000, 'ingested')` before the next tick
- **WHEN** the next STATUS heartbeat fires
- **THEN** the STATUS line SHALL include a pipeline progress delta of `+1500` over the heartbeat interval

#### Scenario: Unit change from fetched to ingested resets delta baseline

- **GIVEN** the previous STATUS tick showed unit `fetched`
- **WHEN** the next tick shows unit `ingested`
- **THEN** the ingested progress delta suffix MAY be omitted on that first ingested tick
- **AND** subsequent ingested ticks SHALL include deltas against the ingested baseline
