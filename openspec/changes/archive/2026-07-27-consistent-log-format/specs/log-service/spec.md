## ADDED Requirements

### Requirement: Log service emits DETAIL lines for operational milestones

The log service SHALL provide a `detail()` helper that emits INFO lines with prefix `DETAIL` followed by space-separated `key=value` pairs. Values containing spaces SHALL be quoted. During an operation with `operationContext`, DETAIL lines SHALL be prefixed with `[operationContext]`. During config bootstrap (before ServiceRegistry exists), DETAIL lines SHALL be prefixed with `[config]`.

#### Scenario: Detail line during account-list setup

- **GIVEN** the account-list operation is in Setup phase
- **WHEN** a caller invokes `log.detail({ sources: 3 })`
- **THEN** the connector host SHALL receive an INFO line `[accountList] DETAIL sources=3`

#### Scenario: Detail line during config bootstrap

- **GIVEN** configuration validation completes before any operation starts
- **WHEN** bootstrap logging records validation success
- **THEN** the connector host SHALL receive an INFO line prefixed with `[config] DETAIL`

### Requirement: Log service emits PHASE END and EPILOGUE END boundaries

The log service SHALL provide `phaseEnd(phaseNumber, phase, detail?)` that emits `PHASE {N} {Phase} END` with optional detail suffix and mandatory `elapsed=` duration since the matching `phaseStart`. The service SHALL provide `epilogueEnd(block, detail?)` that emits `EPILOGUE {block} END` with `elapsed=` duration since the matching epilogue START. Phase elapsed timing for HTML report breakdowns SHALL be captured via internal PhaseTimer recording without emitting colon-style `PHASE N: Description (elapsed)` host lines.

#### Scenario: Phase end logged after setup completes

- **GIVEN** Setup phase began with `PHASE 1 Setup START`
- **WHEN** Setup work completes and `phaseEnd(1, 'Setup')` is called
- **THEN** the connector host SHALL receive `[accountList] PHASE 1 Setup END elapsed=` with a duration suffix
- **AND** the connector host SHALL NOT receive a colon-style line matching `PHASE 1:`

#### Scenario: Epilogue end logged after report generation

- **GIVEN** the epilogue began with `EPILOGUE report START`
- **WHEN** report generation completes
- **THEN** the connector host SHALL receive `[accountList] EPILOGUE report END elapsed=`
- **AND** the connector host SHALL NOT receive a line starting with `Epilogue: report generation`

### Requirement: Non-accountList operations use STEP boundaries

Operations other than accountList (including accountCreate, accountEnable, accountDisable, accountRead, accountUpdate, testConnection, entitlementList, accountDiscoverSchema) SHALL emit `STEP {slug} START` and `STEP {slug} END elapsed=` lines at pipeline boundaries instead of colon-style PhaseTimer phase messages.

#### Scenario: Account create uses STEP lines

- **GIVEN** an accountCreate operation runs
- **WHEN** identity fetch completes
- **THEN** the connector host SHALL receive `STEP fetch-identity END elapsed=`
- **AND** the connector host SHALL NOT receive a line matching `Step 1:`

---

## MODIFIED Requirements

### Requirement: The log service MUST expose a stable, structured log surface

The log service MUST expose a `LogService` interface with the standard levels (`debug`, `info`, `warn`, `error`). The SDK adapter MUST forward every call to the connector host as a plain text message without lossy transformation. For operations with an `operationContext` (for example `accountList`), messages SHALL be prefixed with `[operationContext]`. During config bootstrap before any operation starts, messages emitted via the bootstrap logger SHALL be prefixed with `[config]`. Structured metadata MAY be passed as optional arguments for message formatting, but the host-visible contract for operational visibility SHALL be standardized text line kinds (`STATUS`, `EVENT_SUMMARY`, `PHASE`, `STEP`, `METRIC`, `WARN STALL`, `EPILOGUE`, `DETAIL`) rather than host-indexed structured fields.

#### Scenario: A log call reaches the connector host as plain text

- **GIVEN** a caller invokes `log.info('PHASE 4 Process START')` during accountList
- **WHEN** the host processes the event
- **THEN** the host sees one INFO event whose message includes `[accountList] PHASE 4 Process START`

#### Scenario: Operation context prefixes heartbeat lines

- **GIVEN** the account-list operation has `operationContext` set to `accountList`
- **WHEN** the operation heartbeat emits a STATUS line
- **THEN** the message SHALL begin with `[accountList] STATUS`

### Requirement: Operation heartbeat emits periodic STATUS lines

The log service SHALL provide an operation heartbeat that emits a `STATUS` text line at a configurable interval while an operation heartbeat is active. The interval SHALL be `statsLoggingIntervalMs` from Advanced Connection Settings (configured as `heartbeatInterval` in seconds in the connector UI; default 10 seconds). Each `STATUS` line SHALL include, when available: current phase, current step, pipeline progress (`done/total` with optional unit and delta since the previous tick), operation elapsed time, API queue statistics in compact form `api={active}a/{queued}q/{completed}c` with optional delta suffix, and process memory (RSS and heap used).

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

#### Scenario: Default 10 second heartbeat interval

- **GIVEN** a source configuration with default Advanced Connection Settings (no explicit `heartbeatInterval`)
- **WHEN** an account-list operation runs longer than 10 seconds
- **THEN** at least one STATUS line SHALL be emitted within the first 10 seconds of the operation heartbeat

### Requirement: Phase and step boundaries use standardized text prefixes

The log service SHALL emit `PHASE` and `STEP` text lines at operation pipeline boundaries. Each line SHALL use `START` or `END` with optional detail suffix and mandatory `elapsed=` on END. Phase names SHALL use canonical labels: Setup, Fetch, Refresh, Process, Output. The report terminal block SHALL use `EPILOGUE` (not a phase number) with `START` and `END` lines. Colon-style phase timing lines (for example `PHASE 1: Setup and initialization (26.4S)`) SHALL NOT be emitted to the host.

#### Scenario: Phase start logged before work begins

- **GIVEN** the account-list operation enters Process phase
- **WHEN** processing begins
- **THEN** an INFO line `PHASE 4 Process START` SHALL be emitted before Process work starts

#### Scenario: Phase end logged when phase completes

- **GIVEN** Process phase work has completed
- **WHEN** the phase boundary closes
- **THEN** an INFO line `PHASE 4 Process END elapsed=` SHALL be emitted
- **AND** no colon-style `PHASE 4:` timing line SHALL be emitted

#### Scenario: Step start logged for uncorrelated sweep

- **GIVEN** the Process phase begins uncorrelated managed-account scoring for 800 accounts
- **WHEN** the sweep starts
- **THEN** an INFO line `STEP uncorrelated-sweep START` SHALL be emitted with account count detail

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

---

## REMOVED Requirements

_(none)_
