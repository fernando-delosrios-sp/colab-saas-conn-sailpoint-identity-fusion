# account-list Spec

## Purpose

The account-list operation streams accounts to ISC aggregation. This spec defines the contract for account listing behavior, including an optional non-persistent dry-run mode.
## Requirements
### Requirement: Account list streams all accounts
The system SHALL stream all available accounts when the account-list operation is invoked. In dry-run mode (`dryRun.enabled: true`), the system SHALL stream all accounts non-persistently without modifying state.

#### Scenario: Successful account listing
- **WHEN** the account-list operation is invoked
- **THEN** the system SHALL stream all accounts in the configured sources

#### Scenario: Account listing with filters
- **WHEN** the account-list operation is invoked with filter criteria
- **THEN** the system SHALL stream only accounts matching the filter criteria

#### Scenario: Successful dry-run listing
- **WHEN** the account-list operation is invoked in dry-run mode
- **THEN** the system SHALL stream all accounts without persisting any state changes

### Requirement: Account list supports an optional dry-run input parameter
The account-list operation SHALL accept an optional `dryRun` input object with fields `enabled` (boolean, default false), `saveFile` (boolean, optional), and `sendEmail` (string or array of strings, optional). When `enabled` is true, the operation SHALL run in non-persistent dry-run mode.

#### Scenario: Platform invocation without dryRun parameter
- **WHEN** the account-list operation is invoked by the platform without the `dryRun` input parameter
- **THEN** the system SHALL execute a persistent aggregation, identical to current behavior

#### Scenario: Dry-run mode with enabled flag
- **WHEN** the account-list operation is invoked with `{ dryRun: { enabled: true } }`
- **THEN** the system SHALL execute all Map, Define, and Match phases without persisting state changes, form updates, managed-source aggregation, or delayed-aggregation scheduling

#### Scenario: Dry-run mode saveFile option
- **WHEN** the account-list operation is invoked with `{ dryRun: { enabled: true, saveFile: true } }`
- **THEN** the system SHALL write the dry-run summary and HTML report to the `./reports/` directory on the connector host

#### Scenario: Dry-run mode sendEmail option
- **WHEN** the account-list operation is invoked with `{ dryRun: { enabled: true, sendEmail: "reviewer@example.com" } }`
- **THEN** the system SHALL deliver the dry-run report email to the specified recipients

#### Scenario: Sub-options ignored when dryRun not enabled
- **WHEN** the account-list operation is invoked with `{ dryRun: { saveFile: true } }` without `enabled: true`
- **THEN** the system SHALL execute a normal persistent aggregation and ignore the `saveFile` option

### Requirement: Dry-run mode streams 1-to-1 StdAccountListOutput rows
In dry-run mode, the account-list operation SHALL stream `StdAccountListOutput` rows via `res.send` that are byte-identical in shape to persistent aggregation rows. The rows SHALL NOT carry `matchingStatus`, `reportCategories`, `sourceStatus`, `correlationStatus`, `review` payloads, or synthetic `orphan-deferred:*` stubs.

#### Scenario: Dry-run row output shape matches aggregation output
- **WHEN** the account-list operation runs in dry-run mode
- **THEN** each streamed row SHALL contain only `key`, `attributes`, `disabled`, and standard `StdAccountListOutput` fields

### Requirement: Dry-run mode sends a terminal summary object
After streaming all rows, the account-list operation in dry-run mode SHALL send a terminal summary object via `res.send` containing: total rows sent, identity/managed-account/fusion-account totals, issue summary (warnings/errors), total processing time, and report output paths (if applicable).

#### Scenario: Terminal summary after row streaming
- **WHEN** the account-list operation completes row streaming in dry-run mode
- **THEN** the system SHALL send a summary object as the final `res.send` call

### Requirement: Dry-run report aligns with aggregation report
The dry-run report SHALL use `includeNonMatches: false` (consolidated counters only, no per-account non-matched rows) and SHALL render through the same Handlebars template and email delivery path as the aggregation report. The report title SHALL use the `'Identity Fusion Dry Run Report'` constant to distinguish analysis from persisted aggregation.

#### Scenario: Dry-run report email matches aggregation report structure
- **WHEN** a dry-run report email is delivered
- **THEN** the email SHALL use the same subject format, Handlebars template, and section layout as the aggregation report
- **AND** the title SHALL be `'Identity Fusion Dry Run Report'`

### Requirement: Report epilogue emits reports regardless of pipeline outcome
The account-list operation SHALL execute a report epilogue after the processing pipeline completes, whether the pipeline succeeded or failed. The epilogue SHALL emit the configured reports (the aggregation report for persistent runs; the HTML file and/or email report for dry-run) even when the pipeline failed partway, including when `res.send` throws mid-stream. Each epilogue step SHALL be isolated so that one failing step does not prevent the remaining steps from running. After the epilogue completes, the operation SHALL rethrow any captured pipeline error so that failed runs are still marked failed.

#### Scenario: Aggregation report emitted despite stream failure
- **GIVEN** a persistent aggregation with the fusion report enabled
- **WHEN** `res.send` throws while accounts are being streamed to the platform
- **THEN** the aggregation report SHALL still be generated and delivered
- **AND** the operation SHALL rethrow the original error after the epilogue completes

#### Scenario: Epilogue step failure does not mask pipeline error
- **GIVEN** a pipeline that failed with an original error
- **WHEN** an epilogue report step also fails
- **THEN** the epilogue failure SHALL be logged as a warning
- **AND** the original pipeline error SHALL be the error propagated to the platform

#### Scenario: Successful run emits reports without error
- **WHEN** the pipeline completes successfully
- **THEN** the epilogue SHALL emit the configured reports
- **AND** the operation SHALL complete normally

### Requirement: Dry-run mode performs no write side effects
In dry-run mode, the account-list operation SHALL NOT perform write side effects of any kind. Specifically, it SHALL NOT execute correlation-on-aggregation (the "Correlate missing accounts on aggregation" process governed by per-source `correlationMode: 'correlate'`, which PATCHes ISC identities), and it SHALL NOT fetch the delayed-aggregation sender workflow, whose only consumer is persistent delayed-aggregation scheduling.

#### Scenario: Correlation-on-aggregation suppressed in dry-run
- **GIVEN** a managed source configured with `correlationMode: 'correlate'`
- **WHEN** the account-list operation runs in dry-run mode and missing accounts are detected
- **THEN** no correlation PATCH calls SHALL be issued to ISC identities

#### Scenario: Correlation-on-aggregation still runs in persistent mode
- **GIVEN** a managed source configured with `correlationMode: 'correlate'`
- **WHEN** the account-list operation runs a persistent aggregation and missing accounts are detected
- **THEN** correlation-on-aggregation SHALL execute as before

#### Scenario: Delayed-aggregation sender not fetched in dry-run
- **GIVEN** one or more sources configured for delayed aggregation
- **WHEN** the account-list operation runs in dry-run mode
- **THEN** the delayed-aggregation sender workflow SHALL NOT be fetched

### Requirement: Dry-run emits report artifacts before the terminal summary
In dry-run mode with `saveFile` and/or `sendEmail` requested, the operation SHALL write the HTML report file and/or deliver the report email BEFORE sending the terminal summary via `res.send` (most-durable-first ordering). The terminal summary SHALL remain the final `res.send` call of the operation. If the terminal summary send fails after an otherwise successful pipeline, the operation SHALL fail, but only after all report artifacts have been attempted.

#### Scenario: Report file written before summary send
- **GIVEN** a dry-run invocation with `{ dryRun: { enabled: true, saveFile: true } }`
- **WHEN** the pipeline completes
- **THEN** the HTML report file SHALL be written before the terminal summary is sent
- **AND** the terminal summary SHALL be the final `res.send` call

#### Scenario: Report email delivered before summary send
- **GIVEN** a dry-run invocation with `{ dryRun: { enabled: true, sendEmail: "reviewer@example.com" } }`
- **WHEN** the pipeline completes
- **THEN** the report email SHALL be delivered before the terminal summary is sent

#### Scenario: Summary send failure preserves report artifacts
- **GIVEN** a dry-run invocation with `saveFile` requested
- **WHEN** the pipeline succeeds but the terminal summary `res.send` throws
- **THEN** the HTML report file SHALL already exist on disk
- **AND** the operation SHALL fail with the summary-send error

### Requirement: Failed aggregations persist no state
State persistence is all-or-nothing: when the account-list pipeline fails for any reason, including a mid-stream `res.send` failure, the operation SHALL NOT persist attribute state or batch cumulative counts.

#### Scenario: Stream failure skips state persistence
- **WHEN** `res.send` throws while accounts are being streamed during a persistent aggregation
- **THEN** attribute state SHALL NOT be saved
- **AND** batch cumulative counts SHALL NOT be saved

#### Scenario: Successful run persists state
- **WHEN** a persistent aggregation completes successfully
- **THEN** attribute state and batch cumulative counts SHALL be saved as before

### Requirement: Account-list operation runs an operation heartbeat

The account-list operation SHALL start an operation heartbeat at the beginning of the run and stop it in a `finally` block so the heartbeat is active for the full pipeline and epilogue. The heartbeat SHALL use the configured `statsLoggingIntervalMs` interval from Advanced Connection Settings (default 10 seconds).

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

#### Scenario: Default 10 second interval for account-list heartbeat

- **GIVEN** a source configuration with default Advanced Connection Settings
- **WHEN** a persistent account-list aggregation runs for more than 10 seconds
- **THEN** at least one STATUS heartbeat line SHALL appear within the first 10 seconds

### Requirement: Account-list pipeline logs phase and step boundaries

The account-list operation SHALL emit PHASE and STEP START lines at the beginning of each major phase (Setup, Fetch, Refresh, Process, Output) and at named sub-steps within Process and Output (including identity processing, **orphan identity hydration**, correlated sweep, **record unique registration**, uncorrelated sweep, await-disable-ops, form reconciliation, form cleanup, send-accounts, save-state, schedule-aggregations, await-form-deletes). Phase completion timing lines SHALL remain for report phase-timing breakdown.

#### Scenario: Process phase visible during long matching run

- **GIVEN** Process phase takes more than one heartbeat interval
- **WHEN** an operator reads logs mid-run
- **THEN** a `PHASE 4 Process START` line SHALL appear before matching work
- **AND** subsequent STATUS lines SHALL show `phase=Process` with the active step name

#### Scenario: Record unique registration step visible during bulk registration

- **GIVEN** thousands of record-only managed accounts with match disabled
- **WHEN** the record unique registration step runs
- **THEN** a STEP START line for `record-unique-registration` SHALL appear before uncorrelated sweep
- **AND** STATUS progress during that step SHALL use unit `registered` rather than `analyzed`

### Requirement: Account-list process phase runs record unique registration before uncorrelated sweep

The account-list Process phase SHALL run record unique registration after the correlated managed-account sweep and before the uncorrelated match sweep. Accounts handled in this step SHALL be removed from the managed-account work queue.

#### Scenario: Uncorrelated sweep queue excludes pre-registered record accounts

- **GIVEN** 5000 record-only accounts with match disabled and 200 authoritative uncorrelated accounts
- **WHEN** record unique registration completes
- **THEN** the uncorrelated sweep SHALL process approximately 200 accounts
- **AND** STATUS for uncorrelated sweep SHALL NOT count the 5000 record-only accounts

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

### Requirement: Account-list process phase hydrates orphan correlated identities before correlated sweep

The account-list Process phase SHALL hydrate out-of-scope identities for orphan correlated managed accounts (correlated on the source, unlinked from loaded Fusion rows, still on the work queue after refresh) after managed-account processing is initialized and immediately before the correlated managed-account sweep. The Fetch phase SHALL NOT perform this hydration pass.

#### Scenario: Hydration runs in process phase not fetch phase

- **WHEN** the account-list operation completes the Fetch phase
- **THEN** the connector SHALL NOT have invoked orphan correlated identity hydration
- **WHEN** the Process phase reaches the correlated managed-account sweep
- **THEN** orphan correlated identity hydration SHALL have completed immediately beforehand

#### Scenario: Orphan hydration step is logged

- **GIVEN** at least one orphan correlated managed account on the work queue with an out-of-scope `identityId`
- **WHEN** the Process phase runs
- **THEN** a STEP START line for `orphan-identity-hydration` (or equivalent canonical step name) SHALL appear before the correlated sweep STEP START line

### Requirement: Fetch phase drives pipeline progress for heartbeat STATUS

During the account-list Fetch phase, long-running paginated loads SHALL update `OperationRunContext` progress via `setProgress` after each page completes (or at equivalent pagination boundaries for non-page modes) so STATUS lines show fetch advancement between heartbeat ticks. Progress unit SHALL be `fetched`. When the pagination layer knows a total item count (for example from `X-Total-Count`), progress total SHALL reflect that count; otherwise total MAY equal the running loaded count until a total becomes known. Pipeline progress delta on STATUS SHALL reflect per-page advancement during parallel managed-account fetch, not only multi-page batch jumps.

#### Scenario: STATUS shows fetch progress during managed-account pagination

- **GIVEN** a persistent account-list operation in Fetch phase loading managed accounts across multiple pages
- **AND** at least one heartbeat interval elapses during fetch
- **WHEN** an operator reads STATUS lines
- **THEN** at least one STATUS line SHALL include `phase=Fetch` and `progress=` with unit `fetched`
- **AND** pipeline progress delta SHALL increase while pages are loaded

#### Scenario: Fetch progress delta updates between batch-sized page groups

- **GIVEN** parallel managed-account pagination with page size 250 and heartbeat interval 10 seconds
- **AND** pages complete steadily through a sliding window
- **WHEN** multiple STATUS ticks occur during Fetch
- **THEN** pipeline progress `done` SHALL increase by less than a full window of pages between ticks when fewer than a full window of pages complete in the interval
- **AND** pipeline progress delta SHALL remain independent of the api-queue completed delta

#### Scenario: Fetch progress delta independent of api-queue delta

- **GIVEN** Fetch phase loads pages through the API queue
- **WHEN** a STATUS tick occurs mid-fetch
- **THEN** the line MAY show both a non-zero pipeline progress delta and a non-zero api-queue completed delta
- **AND** the two deltas SHALL remain separate fields on the STATUS line

### Requirement: Setup phase SHALL handle independent resetAccounts and resetForms flags

During Phase 1 Setup of a persistent account-list aggregation, the connector SHALL evaluate `resetForms` and `resetAccounts` independently. When `resetForms` is enabled, the connector SHALL delete all Fusion review form definitions via `FormService.deleteExistingForms()`, patch `resetForms` back to `false`, and continue Setup unless `resetAccounts` is also enabled. When `resetAccounts` is enabled, the connector SHALL patch `resetAccounts` back to `false` (and legacy `reset` to `false` if present), clear persisted fusion state, reset batch cumulative counters, and return from Setup without proceeding to later phases (zero accounts emitted).

#### Scenario: resetAccounts only clears accounts and exits

- **GIVEN** a persistent aggregation with `resetAccounts` enabled and `resetForms` disabled
- **WHEN** Setup runs
- **THEN** the connector SHALL NOT call `FormService.deleteExistingForms()`
- **AND** the connector SHALL clear fusion state and exit Setup early with zero accounts
- **AND** the connector SHALL patch `resetAccounts` to `false`

#### Scenario: resetForms only deletes forms and continues

- **GIVEN** a persistent aggregation with `resetForms` enabled and `resetAccounts` disabled
- **WHEN** Setup runs
- **THEN** the connector SHALL call `FormService.deleteExistingForms()`
- **AND** the connector SHALL patch `resetForms` to `false`
- **AND** Setup SHALL continue through the normal aggregation pipeline

#### Scenario: Both flags enabled deletes forms then resets accounts

- **GIVEN** a persistent aggregation with both `resetAccounts` and `resetForms` enabled
- **WHEN** Setup runs
- **THEN** the connector SHALL delete forms before clearing fusion state
- **AND** the connector SHALL patch both flags to `false`
- **AND** Setup SHALL exit early with zero accounts

#### Scenario: Dry-run skips reset side effects

- **GIVEN** a dry-run aggregation with `resetAccounts` or `resetForms` enabled
- **WHEN** Setup runs
- **THEN** the connector SHALL NOT delete forms, patch config, or clear fusion state
- **AND** when `resetAccounts` is enabled, Setup SHALL still exit early without emitting accounts

### Requirement: Developer settings SHALL expose resetAccounts and resetForms with false defaults

The connector configuration parser SHALL read `resetAccounts` and `resetForms` as boolean Developer Settings. Both SHALL default to `false` when omitted. The parser SHALL treat legacy `reset` as `resetAccounts` when `resetAccounts` is not explicitly set.

#### Scenario: Omitted flags default to false

- **WHEN** developer settings are parsed without `resetAccounts` or `resetForms`
- **THEN** both values SHALL be `false`

#### Scenario: Legacy reset key maps to resetAccounts

- **WHEN** developer settings contain `reset: true` and no `resetAccounts` key
- **THEN** `resetAccounts` SHALL be `true`
- **AND** `resetForms` SHALL remain `false` unless explicitly set

