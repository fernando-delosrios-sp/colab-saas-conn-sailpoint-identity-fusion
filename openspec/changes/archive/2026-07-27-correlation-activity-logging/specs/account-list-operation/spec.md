## MODIFIED Requirements

### Requirement: Account-list pipeline logs phase and step boundaries

The account-list operation SHALL emit PHASE START and PHASE END lines at each major phase boundary (Setup, Fetch, Refresh, Process, Output) and STEP START/END lines at named sub-steps within Process and Output (including identity processing, **managed account initialization**, **orphan identity hydration**, correlated sweep, **record unique registration**, uncorrelated sweep, await-disable-ops, form reconciliation, **clear managed accounts** (Output, non-record mode only), form cleanup, send-accounts, save-state, schedule-aggregations, await-form-deletes). PHASE END lines SHALL include `elapsed=` duration and SHALL include correlation activity detail suffix when link, merge, correlated-action, or skip counters are non-zero for that phase. Phase timing data for HTML report breakdowns SHALL be captured internally without emitting colon-style `PHASE N: Description (elapsed)` host lines.

#### Scenario: Process phase visible during long matching run

- **GIVEN** Process phase takes more than one heartbeat interval
- **WHEN** an operator reads logs mid-run
- **THEN** a `PHASE 4 Process START` line SHALL appear before matching work
- **AND** subsequent STATUS lines SHALL show `phase=Process` with the active step name

#### Scenario: Phase end logged after setup

- **GIVEN** Setup phase completes
- **WHEN** Fetch phase is about to begin
- **THEN** a `PHASE 1 Setup END elapsed=` line SHALL appear
- **AND** no colon-style `PHASE 1:` timing line SHALL appear

#### Scenario: Refresh phase end reports link correlation activity

- **GIVEN** correlation-on-aggregation PATCH ran during Refresh for multiple fusion accounts
- **WHEN** Refresh phase completes
- **THEN** a `PHASE 3 Refresh END` line SHALL include cumulative link correlation totals in its detail suffix

#### Scenario: Record unique registration step visible during bulk registration

- **GIVEN** thousands of record-only managed accounts with match disabled
- **WHEN** the record unique registration step runs
- **THEN** a STEP START line for `record-unique-registration` SHALL appear before uncorrelated sweep
- **AND** STATUS progress during that step SHALL use unit `registered` rather than `analyzed`

#### Scenario: Managed account initialization step visible before correlated sweep

- **GIVEN** a persistent account-list operation with fusion identities loaded
- **WHEN** the Process phase runs managed-account processing initialization (trigram index and linked-account key index build)
- **THEN** a STEP START line for `managed-account-init` SHALL appear after process-decisions (or identity cache handling) and before `orphan-identity-hydration`
- **AND** a matching STEP END line for `managed-account-init` SHALL appear before the correlated sweep STEP START line

#### Scenario: Clear managed accounts step visible at Output phase start

- **GIVEN** a persistent account-list operation not in record mode
- **WHEN** the Output phase begins
- **THEN** a STEP START line for `clear-managed-accounts` SHALL appear before `form-cleanup`
- **AND** a matching STEP END line for `clear-managed-accounts` SHALL appear before subsequent Output sub-steps

#### Scenario: Clear managed accounts step omitted in record mode

- **GIVEN** a persistent account-list operation in record mode
- **WHEN** the Output phase begins and managed accounts cache is retained
- **THEN** no STEP line for `clear-managed-accounts` SHALL be emitted

---

### Requirement: Account-list aggregates match and correlation logs at INFO

During account-list execution, per-account match discovery (`MATCH FOUND`, `EXACT MATCH FOUND`, deferred variants) and correlation trigger messages SHALL NOT be emitted at INFO level. Instead, callers SHALL record events into `OperationRunContext` via `recordEvent` and correlation activity helpers, and the heartbeat SHALL summarize them in `EVENT_SUMMARY` lines. Correlation PATCH activity SHALL be classified as **link** (correlation-on-aggregation) or **merge** (merge-decision-driven). Correlated-action entitlement grants SHALL be recorded when newly assigned. Immediate `warn` and `error` lines for matching and correlation failures SHALL remain unchanged.

#### Scenario: Match discovery summarized not streamed

- **GIVEN** 50 managed accounts receive partial matches during uncorrelated sweep
- **WHEN** the operation runs with default INFO log level
- **THEN** individual `MATCH FOUND:` INFO lines SHALL NOT appear for each account
- **AND** EVENT_SUMMARY lines SHALL report aggregate match counts per heartbeat tick

#### Scenario: Correlation triggers summarized

- **GIVEN** correlation is triggered for multiple fusion accounts during Process phase
- **WHEN** the operation runs with default INFO log level
- **THEN** individual `Triggering correlation for` INFO lines SHALL NOT appear
- **AND** EVENT_SUMMARY lines SHALL report aggregate correlation counts

#### Scenario: Link correlation summarized during Refresh

- **GIVEN** correlation-on-aggregation PATCH is triggered for multiple fusion accounts during Refresh phase
- **WHEN** the operation runs with default INFO log level
- **THEN** individual `Triggering correlation for` INFO lines SHALL NOT appear
- **AND** EVENT_SUMMARY lines SHALL report link correlation counts per heartbeat tick
- **AND** `PHASE 3 Refresh END` SHALL include cumulative link correlation totals

#### Scenario: Merge correlation summarized during Process

- **GIVEN** authorized merge decisions trigger correlation PATCH during Process phase
- **WHEN** the operation runs with default INFO log level
- **THEN** EVENT_SUMMARY lines SHALL report merge correlation counts separately from link counts

#### Scenario: Correlated-action grants visible at INFO

- **GIVEN** multiple fusion accounts become fully correlated and receive the correlated action entitlement during an aggregation
- **WHEN** the operation runs with default INFO log level
- **THEN** EVENT_SUMMARY and phase END lines SHALL report correlated-action grant totals
