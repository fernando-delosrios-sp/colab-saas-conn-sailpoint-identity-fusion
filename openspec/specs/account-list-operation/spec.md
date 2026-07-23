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
