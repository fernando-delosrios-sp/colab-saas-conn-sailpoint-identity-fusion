## ADDED Requirements

### Requirement: Fetch STATUS SHALL render independent population counters

During account-list Fetch phase, the operation heartbeat SHALL render zero or more Fetch population counters on the STATUS line instead of a single `progress=` fraction. Each present counter SHALL use the token shape `{population}={done}/{total}` with optional per-counter delta suffix `(Δ±N/intervalSeconds)`. Allowed population tokens are `fusion-accounts`, `managed-accounts`, and `identities`. Segment order SHALL be fusion-accounts, then managed-accounts, then identities. A counter SHALL be omitted until that population has a known total or `done` greater than zero. The identities counter SHALL be omitted for the whole Fetch when identity Fetch is skipped. Fetch STATUS SHALL NOT include `progress=` with unit `fetched` or `ingested`. The heartbeat SHALL NOT emit a separate line kind for Fetch populations.

Each population SHALL keep an independent delta baseline. The first STATUS tick that includes a given population SHALL omit that population's delta suffix. Appearance of a later population SHALL NOT reset other populations' baselines.

#### Scenario: Concurrent Fusion and managed counters on one STATUS line

- **GIVEN** Fetch phase has Fusion accounts registered 42500 of 102407
- **AND** managed accounts registered 94044 of 158951
- **AND** identity Fetch is skipped
- **WHEN** the operation heartbeat interval fires
- **THEN** the connector host SHALL receive an INFO STATUS line
- **AND** the line SHALL include `fusion-accounts=42500/102407`
- **AND** the line SHALL include `managed-accounts=94044/158951`
- **AND** the line SHALL NOT include `identities=`
- **AND** the line SHALL NOT include `progress=`

#### Scenario: Identities counter appears without replacing Fusion or managed

- **GIVEN** Fetch STATUS already includes fusion-accounts and managed-accounts
- **AND** identity Fetch registers 2500 of 10000 documents
- **WHEN** the next STATUS heartbeat fires
- **THEN** the line SHALL include `identities=2500/10000`
- **AND** the line SHALL still include both fusion-accounts and managed-accounts segments

#### Scenario: Per-population delta does not reset when another counter appears

- **GIVEN** the previous STATUS tick showed `managed-accounts=8500/158951`
- **AND** the next tick shows `managed-accounts=16500/158951` and a new `fusion-accounts` segment
- **WHEN** that tick is emitted
- **THEN** the managed-accounts segment SHALL include a delta of `+8000` over the heartbeat interval
- **AND** the fusion-accounts segment MAY omit its delta on that first appearance

#### Scenario: Empty Fusion Fetch omits fusion-accounts

- **GIVEN** Fusion-account Fetch completes with zero accounts registered and no known positive total
- **WHEN** a STATUS tick fires during Fetch
- **THEN** the line SHALL NOT include `fusion-accounts=`

---

## MODIFIED Requirements

### Requirement: Operation heartbeat emits periodic STATUS lines

The log service SHALL provide an operation heartbeat that emits a `STATUS` text line at a configurable interval while an operation heartbeat is active. The interval SHALL be `statsLoggingIntervalMs` from Advanced Connection Settings (configured as `heartbeatInterval` in seconds in the connector UI; default 10 seconds). Each `STATUS` line SHALL include, when available: current phase, current step, pipeline progress, operation elapsed time, API queue statistics in compact form `api={active}a/{queued}q/{completed}c` with optional delta suffix, and process memory (RSS and heap used).

During Fetch phase, pipeline progress SHALL be Fetch population counters (`fusion-accounts`, `managed-accounts`, `identities`) as specified in **Fetch STATUS SHALL render independent population counters**. During other phases, pipeline progress SHALL be `done/total` with optional unit and delta since the previous tick (`progress=`).

The `{queued}` value in the `api=` segment SHALL be the sum of `QueueStats.queueLength` and `QueueStats.rateLimitWaitCount` (treating absent `rateLimitWaitCount` as zero). This combined pending count SHALL represent all work not yet counted as active in-flight HTTP.

Pipeline progress and API queue completion are independent metrics. Outside Fetch, the pipeline progress delta SHALL reflect change in `OperationRunContext.progress.done`. During Fetch, each population counter's delta SHALL reflect change in that counter's `done`. The api-queue completed delta SHALL reflect change in `QueueStats.totalProcessed`. Both delta styles SHALL use the format `(Δ±N/intervalSeconds)` where `intervalSeconds` is the configured heartbeat interval. The first STATUS tick after heartbeat start SHALL omit delta suffixes until a baseline exists from the prior tick.

When `OperationRunContext.progress.unit` is set outside Fetch, the STATUS line SHALL render the unit immediately after the fraction before the delta suffix (for example `progress=450/800 analyzed(Δ+120/10s)`).

When correlation PATCH activity has occurred in the run and the API queue has pending `IdentityService>correlateAccounts` items, STATUS lines during Output or Epilogue phase SHALL include a correlation drain segment with cumulative `completed=` and snapshot `pending=` counts alongside existing link/merge segments when non-zero.

#### Scenario: STATUS line during account-list Process phase

- **GIVEN** an account-list operation in Process phase with step `uncorrelated-sweep` and progress 537/800 analyzed
- **WHEN** the operation heartbeat interval fires
- **THEN** the connector host SHALL receive an INFO line prefixed with `[accountList] STATUS`
- **AND** the line SHALL include `phase=Process`, `step=uncorrelated-sweep`, and `progress=537/800 analyzed`

#### Scenario: STATUS includes pipeline progress delta during local work

- **GIVEN** pipeline progress was 7596/18495 at the previous STATUS tick and is now 10296/18495 during Refresh phase
- **AND** the API queue completed count remains unchanged
- **WHEN** the next STATUS line is emitted
- **THEN** the line SHALL include `progress=10296/18495` with a delta of `+2700` over the heartbeat interval
- **AND** the api segment SHALL show zero completed delta

#### Scenario: STATUS includes api-queue completed delta

- **GIVEN** the API queue completed count was 537 at the previous STATUS tick and is now 612 with 2 active and 5 queued
- **WHEN** the next STATUS line is emitted
- **THEN** the line SHALL include `api=2a/5q/612c` with a delta indicating `+75` completions since the previous tick

#### Scenario: STATUS api-queue segment uses completed not processed

- **GIVEN** a STATUS line includes API queue statistics
- **WHEN** an operator reads the line
- **THEN** the queue segment SHALL use compact form `api=Na/Nq/Nc`
- **AND** the completion counter SHALL be the third segment suffixed with `c` (not labeled `processed=`)

#### Scenario: STATUS q includes rate-limiter wait when FIFO is empty

- **GIVEN** the FIFO queue length is 0
- **AND** 49 dequeued items are awaiting rate-limit slots (`rateLimitWaitCount` is 49)
- **AND** 0 requests are active in-flight
- **WHEN** the next STATUS line is emitted
- **THEN** the line SHALL include `api=0a/49q/` in the api segment
- **AND** the completed counter delta MAY still increase on subsequent ticks as those items complete HTTP

#### Scenario: Default 10 second heartbeat interval

- **GIVEN** a source configuration with default Advanced Connection Settings
- **WHEN** a persistent account-list aggregation runs for more than 10 seconds
- **THEN** at least one STATUS heartbeat line SHALL appear within the first 10 seconds

#### Scenario: STATUS during Output shows correlation drain while queue pending

- **GIVEN** an account-list operation in Output or Epilogue phase with 2000 link PATCHes enqueued and 147 completed
- **AND** 1853 correlation PATCH jobs remain pending in the API queue
- **WHEN** the next STATUS heartbeat fires
- **THEN** the STATUS line SHALL include `completed=147` and `pending=1853` in the correlation segment

### Requirement: Refresh STATUS SHALL render refreshed progress the same way as fetched

When `log.setProgress` is invoked with unit `refreshed` during Refresh phase, the operation heartbeat SHALL include that progress on the STATUS line in the same shape as other non-Fetch `progress=` units: `progress={done}/{total} refreshed` with an optional delta suffix after the first tick (or after a unit or phase change). Refresh STATUS SHALL NOT append a separate cumulative `refreshed(N)` segment. The heartbeat SHALL NOT emit a distinct `REFRESH` line kind. The log service SHALL NOT expose `recordRefreshedAccount` or a `refreshedCount` field for STATUS.

#### Scenario: Refreshed unit appears on STATUS like Fetch fetched

- **GIVEN** Refresh phase has called `setProgress(19032, 102407, 'refreshed')`
- **WHEN** the operation heartbeat interval fires
- **THEN** the connector host SHALL receive an INFO STATUS line
- **AND** the line SHALL include `progress=19032/102407 refreshed`
- **AND** the line SHALL NOT contain `processed(`
- **AND** the line SHALL NOT contain `refreshed(` as a standalone cumulative segment

#### Scenario: Refreshed progress delta uses previous tick baseline

- **GIVEN** progress was 19032/102407 refreshed at the previous STATUS tick
- **AND** a caller invokes `setProgress(19224, 102407, 'refreshed')` before the next tick
- **WHEN** the next STATUS heartbeat fires
- **THEN** the STATUS line SHALL include a pipeline progress delta of `+192` over the heartbeat interval attached to unit `refreshed`

#### Scenario: Unit change from fetched to refreshed resets delta baseline

- **GIVEN** the previous STATUS tick showed unit `fetched`
- **WHEN** the next tick shows unit `refreshed`
- **THEN** the refreshed progress delta suffix MAY be omitted on that first refreshed tick
- **AND** subsequent refreshed ticks SHALL include deltas against the refreshed baseline

#### Scenario: Phase change from Fetch to Refresh resets delta baseline

- **GIVEN** the previous STATUS tick was Fetch with population counters
- **WHEN** the next tick shows unit `refreshed`
- **THEN** the refreshed progress delta suffix MAY be omitted on that first refreshed tick
- **AND** subsequent refreshed ticks SHALL include deltas against the refreshed baseline

---

## REMOVED Requirements

### Requirement: STATUS SHALL render ingested progress the same way as fetched

**Reason**: Fetch STATUS uses population counters (who-axis). Unit `ingested` is no longer the Fetch pipeline fraction.

**Migration**: Assert `fusion-accounts=` / `identities=` on Fetch STATUS. Keep DETAIL `action=ingesting …` if present. Refresh/Process `progress=` unchanged.
