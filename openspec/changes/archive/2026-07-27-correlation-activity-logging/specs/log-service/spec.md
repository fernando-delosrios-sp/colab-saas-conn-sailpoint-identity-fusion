## ADDED Requirements

### Requirement: OperationRunContext tracks correlation activity counters

The service registry SHALL expose correlation activity counters on `OperationRunContext` updated via log service helpers `recordCorrelationActivity`, `recordCorrelatedActionGranted`, and `recordCorrelationSkipped`. Counters SHALL track PATCH subtypes **link** (correlation-on-aggregation) and **merge** (merge-decision-driven) separately, each with trigger count and account count. A **correlated-action** counter SHALL increment when the correlated action entitlement is newly granted. Skip counters SHALL aggregate reasons: `noIdentity`, `noSourceContext`, `wrongMode`, `noIscAccountId`. The context SHALL maintain both interval counters (reset each heartbeat flush) and phase cumulative counters (reset at `phaseStart`, readable via `flushPhaseCorrelationSummary`).

#### Scenario: Link correlation activity recorded during Refresh

- **GIVEN** correlation-on-aggregation PATCH is triggered for 3 accounts on one fusion account during Refresh phase
- **WHEN** `recordCorrelationActivity({ kind: 'link', accounts: 3 })` is invoked
- **THEN** interval and phase cumulative link trigger counts SHALL increment by 1
- **AND** interval and phase cumulative link account counts SHALL increment by 3

#### Scenario: Correlated-action grant recorded on transition

- **GIVEN** a fusion account transitions from having missing accounts to fully correlated
- **WHEN** `FusionAction.Correlated` is newly added to the account actions
- **THEN** `recordCorrelatedActionGranted()` SHALL increment correlated-action counters
- **AND** idempotent status recomputation without state change SHALL NOT increment the counter again

---

## MODIFIED Requirements

### Requirement: Operation heartbeat emits EVENT_SUMMARY lines

The log service SHALL aggregate account-level events recorded via `recordEvent` and correlation activity helpers between heartbeat ticks and emit one or more `EVENT_SUMMARY` text lines at each tick. Counters SHALL reset after each flush. Multiple summary lines MAY be used when a single line would be excessively long. Correlation activity SHALL appear in `EVENT_SUMMARY` lines using subtype segments `link=triggers/accounts` and `merge=triggers/accounts` when non-zero, plus `correlated-action=` with interval delta when non-zero, and aggregated `skipped=` counts when non-zero.

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

- **GIVEN** 12 correlated-action grants since the last heartbeat tick
- **WHEN** the heartbeat flushes event counters
- **THEN** the connector host SHALL receive an INFO `EVENT_SUMMARY` line containing a correlated-action count with interval delta

---

### Requirement: Log service emits PHASE END and EPILOGUE END boundaries

The log service SHALL provide `phaseEnd(phaseNumber, phase, detail?)` that emits `PHASE {N} {Phase} END` with optional detail suffix and mandatory `elapsed=` duration since the matching `phaseStart`. When correlation activity occurred during the phase, the detail suffix SHALL include cumulative correlation totals using the same `link=`, `merge=`, `correlated-action=`, and `skipped=` segments as EVENT_SUMMARY. The service SHALL provide `epilogueEnd(block, detail?)` that emits `EPILOGUE {block} END` with `elapsed=` duration since the matching epilogue START. Phase elapsed timing for HTML report breakdowns SHALL be captured via internal PhaseTimer recording without emitting colon-style `PHASE N: Description (elapsed)` host lines.

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

#### Scenario: Epilogue end logged after report generation

- **GIVEN** the epilogue began with `EPILOGUE report START`
- **WHEN** report generation completes
- **THEN** the connector host SHALL receive `[accountList] EPILOGUE report END elapsed=`
- **AND** the connector host SHALL NOT receive a line starting with `Epilogue: report generation`

---

### Requirement: OperationRunContext tracks run state for heartbeat consumption

The service registry SHALL expose an `OperationRunContext` updated by log service helpers (`phaseStart`, `phaseEnd`, `stepStart`, `stepEnd`, `setProgress`, `recordEvent`, `recordCorrelationActivity`, `recordCorrelatedActionGranted`, `recordCorrelationSkipped`) and readable by the operation heartbeat within the active AsyncLocalStorage scope. The operation heartbeat SHALL track the previous pipeline progress `done` value alongside previous api-queue completed count for delta calculation. Automatic merge events SHALL be recorded under the category `autoMerged` (not `autoAssigned`). During Refresh phase, STATUS lines MAY include a cumulative correlation segment when link or merge activity has occurred in the phase.

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

#### Scenario: Refresh STATUS includes correlation segment

- **GIVEN** an account-list operation in Refresh phase with cumulative link correlation activity
- **WHEN** the next STATUS heartbeat fires
- **THEN** the STATUS line SHALL include a correlation segment with link totals alongside `refreshed(N)`
