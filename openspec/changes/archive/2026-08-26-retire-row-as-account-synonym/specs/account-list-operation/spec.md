## RENAMED Requirements

- FROM: `### Requirement: Dry-run mode streams 1-to-1 StdAccountListOutput rows`
- TO: `### Requirement: Dry-run mode streams 1-to-1 StdAccountListOutput objects`

- FROM: `### Requirement: Dry-run mode streams only account rows via res.send`
- TO: `### Requirement: Dry-run mode streams only StdAccountListOutput objects via res.send`

## MODIFIED Requirements

### Requirement: Dry-run mode streams 1-to-1 StdAccountListOutput objects

In dry-run mode, the account-list operation SHALL stream `StdAccountListOutput` objects via `res.send` that match persistent aggregation output for the same ISC input state. Objects SHALL use the standard shape (`key`, `attributes`, `disabled`) and SHALL NOT carry legacy enrichment payloads (`matchingStatus`, `reportCategories`, `sourceStatus`, `correlationStatus`, `review`, synthetic `orphan-deferred:*` stubs).

#### Scenario: Dry-run output shape matches aggregation output

- **WHEN** the account-list operation runs in dry-run mode
- **THEN** each streamed `StdAccountListOutput` object SHALL contain only `key`, `attributes`, `disabled`, and standard `StdAccountListOutput` fields

#### Scenario: Dry-run output includes JIT unique attributes

- **GIVEN** Fusion accounts requiring unique attribute refresh during output
- **WHEN** the account-list operation runs in dry-run mode
- **THEN** streamed Fusion accounts SHALL include generated unique attribute values produced by the same JIT output path as persistent aggregation

### Requirement: Dry-run mode streams only StdAccountListOutput objects via res.send

In dry-run mode, `res.send` SHALL emit only `StdAccountListOutput` objects, matching persistent aggregation for the same ISC input state. The operation SHALL NOT send a summary or other non-account payload via `res.send`.

#### Scenario: Dry-run res.send matches persistent aggregation

- **WHEN** the account-list operation completes Fusion account streaming in dry-run mode
- **THEN** every `res.send` call SHALL be a standard `StdAccountListOutput` object
- **AND** no summary or metadata object SHALL be sent via `res.send`

### Requirement: Dry-run mode logs a run summary to console

After the pipeline completes (and after any dry-run report artifacts are written when requested), the account-list operation in dry-run mode SHALL log a run summary object to `console.log` containing: `rowsSent` (count of streamed Fusion accounts), identity/managed-account/fusion-account totals, issue summary (warnings/errors), total processing time, and report output paths (if applicable).

#### Scenario: Run summary logged after streaming

- **WHEN** the account-list operation completes in dry-run mode
- **THEN** the system SHALL log a summary object to `console.log`
- **AND** `rowsSent` in the summary SHALL equal the number of Fusion accounts sent via `res.send`

### Requirement: Account-list pipeline logs phase and step boundaries

The account-list operation SHALL emit PHASE START and PHASE END lines at each major phase boundary (Setup, Fetch, Refresh, Process, Output) and STEP START/END lines at named sub-steps within Process and Output (including identity processing, **managed account initialization**, **orphan identity hydration**, correlated sweep, **record unique registration**, uncorrelated sweep, await-disable-ops, form reconciliation, **clear managed accounts** (Output, non-record mode only), send-accounts, form cleanup, save-state, schedule-aggregations, await-form-deletes). On persistent runs, Output sub-steps after `send-accounts` (`form-cleanup`, `save-state`, `schedule-aggregations`, `await-form-deletes`) SHALL run only after account streaming completes successfully. PHASE END lines SHALL include `elapsed=` duration and SHALL include correlation activity detail suffix when link, merge, completed, or skip counters are non-zero for that phase. Correlation detail on account-list PHASE END lines SHALL NOT include `correlated-action=`. Phase timing data for HTML report breakdowns SHALL be captured internally without emitting colon-style `PHASE N: Description (elapsed)` host lines.

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

#### Scenario: Process phase end reports bulk link enqueue on first run

- **GIVEN** a first account-list run after reset with no existing Fusion accounts
- **WHEN** Process phase completes after enqueuing link PATCHes for managed accounts
- **THEN** a `PHASE 4 Process END` line SHALL include cumulative `link=` enqueue totals
- **AND** the detail SHALL NOT include `correlated-action=`

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
- **THEN** a STEP START line for `clear-managed-accounts` SHALL appear before `send-accounts`
- **AND** a matching STEP END line for `clear-managed-accounts` SHALL appear before subsequent Output sub-steps

#### Scenario: Send accounts step runs before persistent-only output side effects

- **GIVEN** a persistent account-list operation not in dry-run mode
- **WHEN** the Output phase runs through form cleanup and state persistence
- **THEN** a STEP START line for `send-accounts` SHALL appear before `form-cleanup`
- **AND** STEP lines for `save-state`, `schedule-aggregations`, and `await-form-deletes` SHALL appear after `send-accounts`

#### Scenario: Clear managed accounts step omitted in record mode

- **GIVEN** a persistent account-list operation in record mode
- **WHEN** the Output phase begins and managed accounts cache is retained
- **THEN** no STEP line for `clear-managed-accounts` SHALL be emitted

### Requirement: Account-list process phase hydrates orphan correlated identities before correlated sweep

The account-list Process phase SHALL hydrate out-of-scope identities for orphan correlated managed accounts (correlated on the source, unlinked from loaded Fusion accounts, still on the work queue after refresh) after managed-account processing is initialized and immediately before the correlated managed-account sweep. The Fetch phase SHALL NOT perform this hydration pass.

#### Scenario: Hydration runs in process phase not fetch phase

- **WHEN** the account-list operation completes the Fetch phase
- **THEN** the connector SHALL NOT have invoked orphan correlated identity hydration
- **WHEN** the Process phase reaches the correlated managed-account sweep
- **THEN** orphan correlated identity hydration SHALL have completed immediately beforehand

#### Scenario: Orphan hydration step is logged

- **GIVEN** at least one orphan correlated managed account on the work queue with an out-of-scope `identityId`
- **WHEN** the Process phase runs
- **THEN** a STEP START line for `orphan-identity-hydration` (or equivalent canonical step name) SHALL appear before the correlated sweep STEP START line

### Requirement: Dry-run mode runs the full accountList pipeline

In dry-run mode, the account-list operation SHALL execute the same Setup, Fetch, Refresh, Process, and Output phases as a persistent aggregation. Dry-run SHALL NOT skip Match outcomes (automatic merge, review forms), correlation logic, orphan disable queuing, or account output streaming. Write side effects to the ISC tenant SHALL be inhibited at the client API adapter boundary rather than by skipping business logic.

#### Scenario: Dry-run executes output streaming

- **GIVEN** a dry-run invocation with `{ dryRun: { enabled: true } }`
- **WHEN** the pipeline reaches Phase 5 Output
- **THEN** the system SHALL invoke `forEachISCAccount` and stream each account via `res.send`
- **AND** `rowsSent` in the console run summary SHALL equal the number of Fusion accounts sent

#### Scenario: Dry-run runs Match and Correlation logic

- **GIVEN** a dry-run invocation with managed accounts that trigger exact match, partial match, or correlation-on-aggregation
- **WHEN** the Process phase executes
- **THEN** the same Match and Correlation code paths SHALL run as in a persistent aggregation
- **AND** ISC write API calls SHALL be inhibited at the adapter without mutating the tenant
