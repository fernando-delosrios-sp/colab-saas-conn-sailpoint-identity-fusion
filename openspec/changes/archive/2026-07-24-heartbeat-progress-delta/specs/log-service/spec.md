## MODIFIED Requirements

### Requirement: Operation heartbeat emits periodic STATUS lines

The log service SHALL provide an operation heartbeat that emits a `STATUS` text line at a configurable interval while an operation heartbeat is active. The interval SHALL be `statsLoggingIntervalMs` from Advanced Connection Settings (configured as `heartbeatInterval` in seconds in the connector UI; default 10 seconds). Each `STATUS` line SHALL include, when available: current phase, current step, pipeline progress (`done/total` with optional unit and delta since the previous tick), operation elapsed time, API queue statistics labeled `api-queue` with `completed` count and delta since the previous tick, and process memory (RSS and heap used).

Pipeline progress and API queue completion are independent metrics. The pipeline progress delta SHALL reflect change in `OperationRunContext.progress.done`. The api-queue completed delta SHALL reflect change in `QueueStats.totalProcessed`. Both deltas SHALL use the format `(Δ±N/intervalSeconds)` where `intervalSeconds` is the configured heartbeat interval. The first STATUS tick after heartbeat start SHALL omit delta suffixes until a baseline exists from the prior tick.

When `OperationRunContext.progress.unit` is set, the STATUS line SHALL render the unit immediately after the fraction before the delta suffix (for example `progress=450/800 analyzed(Δ+120/10s)`).

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
- **AND** the api-queue segment SHALL show zero completed delta

#### Scenario: STATUS includes api-queue completed delta

- **GIVEN** the API queue completed count was 537 at the previous STATUS tick and is now 612
- **WHEN** the next STATUS line is emitted
- **THEN** the line SHALL include `api-queue` with `completed=612` and a delta indicating `+75` completions since the previous tick

#### Scenario: STATUS api-queue segment uses completed not processed

- **GIVEN** a STATUS line includes API queue statistics
- **WHEN** an operator reads the line
- **THEN** the queue segment SHALL be prefixed with `api-queue`
- **AND** the completion counter SHALL be labeled `completed=` not `processed=`

#### Scenario: Default 10 second heartbeat interval

- **GIVEN** a source configuration with default Advanced Connection Settings (no explicit `heartbeatInterval`)
- **WHEN** an account-list operation runs longer than 10 seconds
- **THEN** at least one STATUS line SHALL be emitted within the first 10 seconds of the operation heartbeat

---

### Requirement: Operation heartbeat detects and warns on queue stall

When the API queue `totalProcessed` (reported in STATUS as `api-queue completed`) count does not increase for two consecutive STATUS ticks while the queue has active or queued items, the heartbeat SHALL emit a `WARN STALL` line listing the top active queue item labels grouped by count. Pipeline progress delta SHALL NOT influence stall detection.

#### Scenario: Stall warning after flat api-queue completed count

- **GIVEN** api-queue stats show active or queued items
- **AND** `completed` count is unchanged across two consecutive STATUS ticks
- **WHEN** the second STATUS tick completes
- **THEN** the connector host SHALL receive a WARN line containing `STALL`
- **AND** the line SHALL name the most frequent active queue labels

#### Scenario: No stall when pipeline advances but api-queue is idle

- **GIVEN** Refresh phase pipeline progress increases each STATUS tick
- **AND** api-queue active and queued counts are zero with unchanged completed count
- **WHEN** multiple STATUS ticks occur
- **THEN** the connector host SHALL NOT receive a `WARN STALL` line solely because api-queue completed delta is zero

---

### Requirement: OperationRunContext tracks run state for heartbeat consumption

The service registry SHALL expose an `OperationRunContext` updated by log service helpers (`phaseStart`, `phaseEnd`, `stepStart`, `stepEnd`, `setProgress`, `recordEvent`) and readable by the operation heartbeat within the active AsyncLocalStorage scope. The operation heartbeat SHALL track the previous pipeline progress `done` value alongside previous api-queue completed count for delta calculation.

#### Scenario: Progress update reflected in next STATUS line

- **GIVEN** a caller invokes `setProgress(450, 800, 'analyzed')`
- **WHEN** the next STATUS heartbeat fires
- **THEN** the STATUS line SHALL include `progress=450/800 analyzed`

#### Scenario: Progress delta uses previous tick baseline

- **GIVEN** progress was 450/800 at the previous STATUS tick
- **AND** a caller invokes `setProgress(570, 800, 'analyzed')` before the next tick
- **WHEN** the next STATUS heartbeat fires
- **THEN** the STATUS line SHALL include a pipeline progress delta of `+120` over the heartbeat interval
