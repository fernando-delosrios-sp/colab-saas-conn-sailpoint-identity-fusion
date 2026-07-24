# log-service Spec

## Purpose

The log service (`src/services/logService/`) is the connector's logging facade. It defines the `LogService` interface, the SDK adapter that writes to the connector host, and the helper utilities used elsewhere in the codebase to log structured events, known operation function names, and a small set of standardized debug/warn patterns. This spec defines the contract for what the rest of the connector can assume about the log surface (level, structured fields, redaction) and what the host receives.
## Requirements
### Requirement: The log service MUST expose a stable, structured log surface

The log service MUST expose a `LogService` interface with the standard levels (`debug`, `info`, `warn`, `error`). The SDK adapter MUST forward every call to the connector host as a plain text message without lossy transformation. For operations with an `operationContext` (for example `accountList`), messages SHALL be prefixed with `[operationContext]`. Structured metadata MAY be passed as optional arguments for message formatting, but the host-visible contract for operational visibility SHALL be standardized text line kinds (`STATUS`, `EVENT_SUMMARY`, `PHASE`, `STEP`, `METRIC`, `WARN STALL`, `EPILOGUE`) rather than host-indexed structured fields.

#### Scenario: A log call reaches the connector host as plain text

- **GIVEN** a caller invokes `log.info('PHASE 4 Process START')` during accountList
- **WHEN** the host processes the event
- **THEN** the host sees one INFO event whose message includes `[accountList] PHASE 4 Process START`

#### Scenario: Operation context prefixes heartbeat lines

- **GIVEN** the account-list operation has `operationContext` set to `accountList`
- **WHEN** the operation heartbeat emits a STATUS line
- **THEN** the message SHALL begin with `[accountList] STATUS`

### Requirement: Operation heartbeat emits periodic STATUS lines

The log service SHALL provide an operation heartbeat that emits a `STATUS` text line at a configurable interval while an operation heartbeat is active. The interval SHALL be `statsLoggingIntervalMs` from Advanced Connection Settings (configured as `heartbeatInterval` in seconds in the connector UI; default 10 seconds). Each `STATUS` line SHALL include, when available: current phase, current step, progress (`done/total`), operation elapsed time, API queue statistics with processed-count delta since the previous tick, and process memory (RSS and heap used).

#### Scenario: STATUS line during account-list Process phase

- **GIVEN** an account-list operation in Process phase with step `uncorrelated-sweep` and progress 537/800
- **WHEN** the operation heartbeat interval fires
- **THEN** the connector host SHALL receive an INFO line prefixed with `[accountList] STATUS`
- **AND** the line SHALL include `phase=Process`, `step=uncorrelated-sweep`, and `progress=537/800`

#### Scenario: STATUS includes queue delta

- **GIVEN** the API queue processed count was 537 at the previous STATUS tick and remains 537
- **WHEN** the next STATUS line is emitted
- **THEN** the line SHALL include `processed=537` and a delta indicating zero completions since the previous tick

#### Scenario: Default 10 second heartbeat interval

- **GIVEN** a source configuration with default Advanced Connection Settings (no explicit `heartbeatInterval`)
- **WHEN** an account-list operation runs longer than 10 seconds
- **THEN** at least one STATUS line SHALL be emitted within the first 10 seconds of the operation heartbeat

### Requirement: Operation heartbeat emits EVENT_SUMMARY lines

The log service SHALL aggregate account-level events recorded via `recordEvent` between heartbeat ticks and emit one or more `EVENT_SUMMARY` text lines at each tick. Counters SHALL reset after each flush. Multiple summary lines MAY be used when a single line would be excessively long.

#### Scenario: Match events summarized per tick

- **GIVEN** 12 partial matches and 2 exact matches recorded since the last heartbeat tick
- **WHEN** the heartbeat flushes event counters
- **THEN** the connector host SHALL receive an INFO line containing `EVENT_SUMMARY` with match counts
- **AND** per-account `MATCH FOUND` lines SHALL NOT have been emitted at INFO level for those events

#### Scenario: Correlation events summarized per tick

- **GIVEN** 14 correlation triggers affecting 18 accounts since the last tick
- **WHEN** the heartbeat flushes event counters
- **THEN** the connector host SHALL receive an INFO `EVENT_SUMMARY` line reporting correlation totals

### Requirement: Operation heartbeat detects and warns on queue stall

When the API queue `totalProcessed` count does not increase for two consecutive STATUS ticks while the queue has active or queued items, the heartbeat SHALL emit a `WARN STALL` line listing the top active queue item labels grouped by count.

#### Scenario: Stall warning after flat processed count

- **GIVEN** queue stats show active or queued items
- **AND** `totalProcessed` is unchanged across two consecutive STATUS ticks (~60 seconds)
- **WHEN** the second STATUS tick completes
- **THEN** the connector host SHALL receive a WARN line containing `STALL`
- **AND** the line SHALL name the most frequent active queue labels

### Requirement: Phase and step boundaries use standardized text prefixes

The log service SHALL emit `PHASE` and `STEP` text lines at operation pipeline boundaries. Each line SHALL use `START` or `END` with optional elapsed duration on END. Phase names SHALL use canonical labels: Setup, Fetch, Refresh, Process, Output. The report terminal block SHALL use `EPILOGUE` (not a phase number).

#### Scenario: Phase start logged before work begins

- **GIVEN** the account-list operation enters Process phase
- **WHEN** processing begins
- **THEN** an INFO line `PHASE 4 Process START` SHALL be emitted before Process work starts
- **AND** the existing phase completion timing line SHALL still be emitted when Process completes

#### Scenario: Step start logged for uncorrelated sweep

- **GIVEN** the Process phase begins uncorrelated managed-account scoring for 800 accounts
- **WHEN** the sweep starts
- **THEN** an INFO line `STEP uncorrelated-sweep START` SHALL be emitted with account count detail

### Requirement: OperationRunContext tracks run state for heartbeat consumption

The service registry SHALL expose an `OperationRunContext` updated by log service helpers (`phaseStart`, `phaseEnd`, `stepStart`, `stepEnd`, `setProgress`, `recordEvent`) and readable by the operation heartbeat within the active AsyncLocalStorage scope.

#### Scenario: Progress update reflected in next STATUS line

- **GIVEN** a caller invokes `setProgress(450, 800, 'analyzed')`
- **WHEN** the next STATUS heartbeat fires
- **THEN** the STATUS line SHALL include `progress=450/800`

### Requirement: Heartbeat interval is configurable in Advanced Connection Settings

The connector SHALL expose a **Heartbeat interval (seconds)** setting (`heartbeatInterval`) in Advanced Connection Settings. The setting SHALL default to 10 seconds when unset. At runtime the connector SHALL convert the configured value to milliseconds and expose it as `statsLoggingIntervalMs` on `FusionConfig` for operation heartbeat consumption.

#### Scenario: Default heartbeat interval when setting omitted

- **GIVEN** a source configuration with no `heartbeatInterval` value
- **WHEN** `safeReadConfig` completes
- **THEN** `statsLoggingIntervalMs` SHALL be 10000

#### Scenario: Custom heartbeat interval from advanced settings

- **GIVEN** a source configuration with `heartbeatInterval` set to 30
- **WHEN** `safeReadConfig` completes
- **THEN** `statsLoggingIntervalMs` SHALL be 30000

#### Scenario: Setting appears in connector-spec Advanced Connection Settings

- **GIVEN** an operator views Advanced Connection Settings in the connector UI
- **WHEN** the section renders
- **THEN** a **Heartbeat interval (seconds)** field keyed `heartbeatInterval` SHALL be present
- **AND** the documented default SHALL be 10 seconds

