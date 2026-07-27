## MODIFIED Requirements

### Requirement: Operation heartbeat emits EVENT_SUMMARY lines

The log service SHALL aggregate account-level events recorded via `recordEvent` and correlation activity helpers between heartbeat ticks and emit one or more `EVENT_SUMMARY` text lines at each tick. Counters SHALL reset after each flush. Multiple summary lines MAY be used when a single line would be excessively long. Correlation activity SHALL appear in `EVENT_SUMMARY` lines using subtype segments `link=triggers/accounts` and `merge=triggers/accounts` when non-zero, plus `completed=` with interval delta when non-zero (summed across link and merge completions), and aggregated `skipped=` counts when non-zero. During account-list aggregation (`isAggregationMode`), correlation `EVENT_SUMMARY` segments SHALL NOT include `correlated-action=`.

#### Scenario: Match events summarized per tick

- **GIVEN** 12 partial matches and 2 exact matches recorded since the last heartbeat tick
- **WHEN** the heartbeat flushes event counters
- **THEN** the connector host SHALL receive an INFO line containing `EVENT_SUMMARY` with match counts
- **AND** per-account `MATCH FOUND` lines SHALL NOT have been emitted at INFO level for those events

#### Scenario: Correlation events summarized per tick

- **GIVEN** 14 correlation triggers affecting 18 accounts since the last tick
- **WHEN** the heartbeat flushes event counters
- **THEN** the connector host SHALL receive an INFO `EVENT_SUMMARY` line reporting correlation totals

#### Scenario: Correlation link and merge summarized per tick

- **GIVEN** 14 link correlation triggers affecting 18 accounts and 2 merge correlation triggers affecting 2 accounts since the last tick
- **WHEN** the heartbeat flushes event counters
- **THEN** the connector host SHALL receive an INFO `EVENT_SUMMARY` line containing `correlations link=14/18 merge=2/2`
- **AND** per-account `Triggering correlation for` INFO lines SHALL NOT appear for those events

#### Scenario: Correlated-action grants summarized per tick

- **GIVEN** 12 correlated-action grants since the last heartbeat tick during a non-aggregation operation
- **WHEN** the heartbeat flushes event counters
- **THEN** the connector host SHALL receive an INFO `EVENT_SUMMARY` line containing a correlated-action count with interval delta
- **AND** account-list aggregation EVENT_SUMMARY segments SHALL NOT contain `correlated-action=`

#### Scenario: Correlation completed summarized per tick

- **GIVEN** 147 correlation PATCHes completed successfully since the last heartbeat tick
- **WHEN** the heartbeat flushes event counters
- **THEN** the connector host SHALL receive an INFO `EVENT_SUMMARY` line containing `completed=+147/` with interval seconds suffix

#### Scenario: Account-list aggregation excludes correlated-action from EVENT_SUMMARY

- **GIVEN** an account-list operation in aggregation mode with fusion accounts becoming fully correlated in output
- **WHEN** the heartbeat flushes correlation event counters
- **THEN** the `EVENT_SUMMARY` correlation segment SHALL NOT contain `correlated-action=`

---

### Requirement: Operation heartbeat emits periodic STATUS lines

The log service SHALL provide an operation heartbeat that emits a `STATUS` text line at a configurable interval while an operation heartbeat is active. The interval SHALL be `statsLoggingIntervalMs` from Advanced Connection Settings (configured as `heartbeatInterval` in seconds in the connector UI; default 10 seconds). Each `STATUS` line SHALL include, when available: current phase, current step, pipeline progress (`done/total` with optional unit and delta since the previous tick), operation elapsed time, API queue statistics in compact form `api={active}a/{queued}q/{completed}c` with optional delta suffix, and process memory (RSS and heap used).

Pipeline progress and API queue completion are independent metrics. The pipeline progress delta SHALL reflect change in `OperationRunContext.progress.done`. The api-queue completed delta SHALL reflect change in `QueueStats.totalProcessed`. Both deltas SHALL use the format `(Δ±N/intervalSeconds)` where `intervalSeconds` is the configured heartbeat interval. The first STATUS tick after heartbeat start SHALL omit delta suffixes until a baseline exists from the prior tick.

When `OperationRunContext.progress.unit` is set, the STATUS line SHALL render the unit immediately after the fraction before the delta suffix (for example `progress=450/800 analyzed(Δ+120/10s)`).

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

#### Scenario: Default 10 second heartbeat interval

- **GIVEN** a source configuration with default Advanced Connection Settings
- **WHEN** a persistent account-list aggregation runs for more than 10 seconds
- **THEN** at least one STATUS heartbeat line SHALL appear within the first 10 seconds

#### Scenario: STATUS during Output shows correlation drain while queue pending

- **GIVEN** an account-list operation in Output or Epilogue phase with 2000 link PATCHes enqueued and 147 completed
- **AND** 1853 correlation PATCH jobs remain pending in the API queue
- **WHEN** the next STATUS heartbeat fires
- **THEN** the STATUS line SHALL include `completed=147` and `pending=1853` in the correlation segment

---

### Requirement: Log service emits PHASE END and EPILOGUE END boundaries

The log service SHALL provide `phaseEnd(phaseNumber, phase, detail?)` that emits `PHASE {N} {Phase} END` with optional detail suffix and mandatory `elapsed=` duration since the matching `phaseStart`. When correlation activity occurred during the phase, the detail suffix SHALL include cumulative correlation totals using `link=`, `merge=`, `completed=`, and `skipped=` segments as applicable. During account-list aggregation, phase END correlation detail SHALL NOT include `correlated-action=`. The service SHALL provide `epilogueEnd(block, detail?)` that emits `EPILOGUE {block} END` with `elapsed=` duration since the matching epilogue START. Phase elapsed timing for HTML report breakdowns SHALL be captured via internal PhaseTimer recording without emitting colon-style `PHASE N: Description (elapsed)` host lines.

#### Scenario: Phase end logged after setup completes

- **GIVEN** Setup phase began with `PHASE 1 Setup START`
- **WHEN** Setup work completes and `phaseEnd(1, 'Setup')` is called
- **THEN** the connector host SHALL receive `[accountList] PHASE 1 Setup END elapsed=` with a duration suffix
- **AND** the connector host SHALL NOT receive a colon-style line matching `PHASE 1:`

#### Scenario: Refresh phase end includes link correlation totals

- **GIVEN** Refresh phase recorded 42 link correlation triggers affecting 56 accounts
- **WHEN** `phaseEnd(3, 'Refresh', detail)` is called with flushed correlation summary
- **THEN** the connector host SHALL receive `[accountList] PHASE 3 Refresh END correlations link=42/56 … elapsed=`
- **AND** the detail SHALL include cumulative phase totals not interval deltas

#### Scenario: Process phase end includes completed drain totals

- **GIVEN** Process phase enqueued 2000 link PATCHes and 147 completed before phase end
- **WHEN** `phaseEnd(4, 'Process', detail)` is called with flushed correlation summary
- **THEN** the phase END detail SHALL include `link=…` enqueue totals and `completed=147` when non-zero

#### Scenario: Epilogue end logged after report generation

- **GIVEN** the epilogue began with `EPILOGUE report START`
- **WHEN** report generation completes
- **THEN** the connector host SHALL receive `[accountList] EPILOGUE report END elapsed=`
- **AND** the connector host SHALL NOT receive a line starting with `Epilogue: report generation`

---

### Requirement: OperationRunContext tracks correlation activity counters

The service registry SHALL expose correlation activity counters on `OperationRunContext` updated via log service helpers `recordCorrelationActivity`, `recordCorrelationCompleted`, `recordCorrelatedActionGranted`, and `recordCorrelationSkipped`. Counters SHALL track PATCH subtypes **link** (correlation-on-aggregation) and **merge** (merge-decision-driven) separately, each with trigger count and account count. Counters SHALL track **linkCompleted** and **mergeCompleted** counts incremented when correlation PATCH promises resolve successfully. A **correlated-action** counter SHALL increment when the correlated action entitlement is newly granted during non-aggregation operations only; it SHALL NOT increment during account-list aggregation mode. Skip counters SHALL aggregate reasons: `noIdentity`, `noSourceContext`, `wrongMode`, `noIscAccountId`. The context SHALL maintain both interval counters (reset each heartbeat flush) and phase cumulative counters (reset at `phaseStart`, readable via `flushPhaseCorrelationSummary`).

#### Scenario: Link correlation activity recorded during Refresh

- **GIVEN** correlation-on-aggregation PATCH is triggered for 3 accounts on one fusion account during Refresh phase
- **WHEN** `recordCorrelationActivity({ kind: 'link', accounts: 3 })` is invoked
- **THEN** interval and phase cumulative link trigger counts SHALL increment by 1
- **AND** interval and phase cumulative link account counts SHALL increment by 3

#### Scenario: Correlation completed recorded on PATCH resolve

- **GIVEN** a link correlation PATCH for one managed account resolves successfully
- **WHEN** `recordCorrelationCompleted({ kind: 'link' })` is invoked
- **THEN** interval and phase cumulative linkCompleted counts SHALL increment by 1

#### Scenario: Correlated-action grant suppressed during aggregation

- **GIVEN** an account-list operation in aggregation mode
- **WHEN** a fusion account transitions to fully correlated output state via `updateCorrelationStatus`
- **THEN** correlated-action counters SHALL NOT increment
- **AND** output state update SHALL still occur

#### Scenario: Correlated-action grant recorded on transition

- **GIVEN** a non-aggregation operation where a fusion account transitions from having missing accounts to fully correlated
- **WHEN** `FusionAction.Correlated` is newly added and `recordCorrelatedActionGranted()` is invoked
- **THEN** correlated-action counters SHALL increment
- **AND** idempotent status recomputation without state change SHALL NOT increment the counter again

---

## ADDED Requirements

### Requirement: Heartbeat snapshot includes correlation queue pending count

The service registry heartbeat snapshot SHALL include a `correlationQueuePending` count derived from pending API queue items whose label matches the `IdentityService>correlateAccounts` prefix. The operation heartbeat SHALL use this count for STATUS `pending=` segments.

#### Scenario: Pending count reflects queued correlation PATCHes

- **GIVEN** the API queue has 1853 pending items labeled `IdentityService>correlateAccounts`
- **WHEN** `getHeartbeatSnapshot()` is called
- **THEN** `correlationQueuePending` SHALL be 1853
