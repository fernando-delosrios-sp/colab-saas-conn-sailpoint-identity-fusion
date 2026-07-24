## ADDED Requirements

### Requirement: Account-list operation runs an operation heartbeat

The account-list operation SHALL start an operation heartbeat at the beginning of the run and stop it in a `finally` block so the heartbeat is active for the full pipeline and epilogue. The heartbeat SHALL use the configured `statsLoggingIntervalMs` interval.

#### Scenario: Heartbeat active for entire account-list run

- **GIVEN** a persistent account-list aggregation begins
- **WHEN** the pipeline executes through Output and the report epilogue
- **THEN** STATUS heartbeat lines SHALL be emitted at the configured interval throughout the run
- **AND** the heartbeat SHALL stop when the operation handler completes

#### Scenario: Heartbeat stopped on pipeline failure

- **GIVEN** the account-list pipeline fails during Process phase
- **WHEN** the report epilogue runs and the operation rethrows the error
- **THEN** the heartbeat SHALL still have emitted STATUS lines up to the failure window
- **AND** the heartbeat SHALL stop in `finally` without leaking the interval

---

### Requirement: Account-list pipeline logs phase and step boundaries

The account-list operation SHALL emit PHASE and STEP START lines at the beginning of each major phase (Setup, Fetch, Refresh, Process, Output) and at named sub-steps within Process and Output (including identity processing, correlated sweep, uncorrelated sweep, await-disable-ops, form reconciliation, form cleanup, send-accounts, save-state, schedule-aggregations, await-form-deletes). Phase completion timing lines SHALL remain for report phase-timing breakdown.

#### Scenario: Process phase visible during long matching run

- **GIVEN** Process phase takes more than one heartbeat interval
- **WHEN** an operator reads logs mid-run
- **THEN** a `PHASE 4 Process START` line SHALL appear before matching work
- **AND** subsequent STATUS lines SHALL show `phase=Process` with the active step name

---

### Requirement: Account-list aggregates match and correlation logs at INFO

During account-list execution, per-account match discovery (`MATCH FOUND`, `EXACT MATCH FOUND`, deferred variants) and correlation trigger messages SHALL NOT be emitted at INFO level. Instead, callers SHALL record events into `OperationRunContext` and the heartbeat SHALL summarize them in `EVENT_SUMMARY` lines. Immediate `warn` and `error` lines for matching failures SHALL remain unchanged.

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
