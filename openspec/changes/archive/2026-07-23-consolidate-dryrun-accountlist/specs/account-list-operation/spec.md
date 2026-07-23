## ADDED Requirements

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

## MODIFIED Requirements

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
