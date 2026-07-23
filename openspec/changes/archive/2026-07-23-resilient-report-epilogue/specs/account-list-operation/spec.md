# account-list-operation Delta

## ADDED Requirements

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
