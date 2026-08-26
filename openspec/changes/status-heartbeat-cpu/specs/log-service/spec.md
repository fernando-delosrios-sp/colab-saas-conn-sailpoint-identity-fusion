## ADDED Requirements

### Requirement: STATUS includes process CPU percent

When a previous process CPU sample exists, each `STATUS` line SHALL include a **STATUS CPU segment** `cpu={percent}%` immediately after the memory segment and before `elapsed=`. `{percent}` SHALL be a rounded integer. The percent SHALL be one-core relative: `(user + system)` microseconds from `process.cpuUsage` since the previous sample, divided by actual wall-clock microseconds since that sample, times 100. The heartbeat SHALL seed `process.cpuUsage()` when it starts so the first STATUS tick MAY include `cpu=`. The heartbeat SHALL omit `cpu=` when no previous sample exists or wall-clock elapsed is zero. The CPU baseline SHALL NOT reset on phase or progress-unit change. The percent SHALL NOT be clamped at 100. `STATUS` SHALL NOT include user/system split, CPU-seconds, load average, or cgroup quota. `EVENT_SUMMARY`, `METRIC`, email reports, and `WARN STALL` SHALL NOT gain CPU fields from this requirement.

#### Scenario: STATUS includes cpu after mem

- **GIVEN** an account-list operation heartbeat with a previous CPU sample
- **AND** user+system CPU time since that sample is 87% of one core over the actual wall-clock elapsed
- **WHEN** the next STATUS line is formatted
- **THEN** the line SHALL include `cpu=87%`
- **AND** `cpu=` SHALL appear after `mem=` and before `elapsed=`

#### Scenario: First STATUS after heartbeat start includes cpu

- **GIVEN** the operation heartbeat recorded `process.cpuUsage()` at start
- **WHEN** the first STATUS tick fires with non-zero wall-clock elapsed
- **THEN** the STATUS line SHALL include `cpu=`

#### Scenario: STATUS omits cpu without a previous sample

- **GIVEN** no previous process CPU sample exists
- **WHEN** a STATUS line is formatted
- **THEN** the line SHALL NOT include `cpu=`

#### Scenario: CPU percent uses actual wall time not the configured interval

- **GIVEN** the previous CPU sample was taken 25 seconds ago
- **AND** user+system CPU time since that sample equals 25 seconds of one core
- **AND** the configured heartbeat interval is 10 seconds
- **WHEN** the next STATUS line is formatted
- **THEN** the line SHALL include `cpu=100%`
- **AND** the line SHALL NOT include `cpu=250%`

#### Scenario: CPU percent may exceed 100

- **GIVEN** user+system CPU time since the previous sample is 150% of one core over the actual wall-clock elapsed
- **WHEN** the next STATUS line is formatted
- **THEN** the line SHALL include `cpu=150%`

#### Scenario: Phase change does not drop cpu

- **GIVEN** a previous CPU sample from Fetch phase
- **WHEN** the next STATUS tick is Refresh
- **THEN** the STATUS line SHALL still include `cpu=` when wall-clock elapsed is non-zero

---

## MODIFIED Requirements

### Requirement: Operation heartbeat emits periodic STATUS lines

The log service SHALL provide an operation heartbeat that emits a `STATUS` text line at a configurable interval while an operation heartbeat is active. The interval SHALL be `statsLoggingIntervalMs` from Advanced Connection Settings (configured as `heartbeatInterval` in seconds in the connector UI; default 10 seconds). Each `STATUS` line SHALL include, when available: current phase, current step, pipeline progress, operation elapsed time, API queue statistics in compact form `api={active}a/{queued}q/{completed}c` with optional delta suffix, process memory (RSS and heap used), and process CPU percent (`cpu={percent}%`) as specified in **STATUS includes process CPU percent**.

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
