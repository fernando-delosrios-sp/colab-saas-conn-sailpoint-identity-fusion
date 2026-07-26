## ADDED Requirements

### Requirement: Dry-run mode runs the full accountList pipeline

In dry-run mode, the account-list operation SHALL execute the same Setup, Fetch, Refresh, Process, and Output phases as a persistent aggregation. Dry-run SHALL NOT skip Match outcomes (auto-assign, review forms), correlation logic, orphan disable queuing, or account output streaming. Write side effects to the ISC tenant SHALL be inhibited at the client API adapter boundary rather than by skipping business logic.

#### Scenario: Dry-run executes output streaming

- **GIVEN** a dry-run invocation with `{ dryRun: { enabled: true } }`
- **WHEN** the pipeline reaches Phase 5 Output
- **THEN** the system SHALL invoke `forEachISCAccount` and stream each account via `res.send`
- **AND** `rowsSent` in the terminal summary SHALL equal the number of account rows sent

#### Scenario: Dry-run runs Match and Correlation logic

- **GIVEN** a dry-run invocation with managed accounts that trigger exact match, partial match, or correlation-on-aggregation
- **WHEN** the Process phase executes
- **THEN** the same Match and Correlation code paths SHALL run as in a persistent aggregation
- **AND** ISC write API calls SHALL be inhibited at the adapter without mutating the tenant

### Requirement: Dry-run and record mode are mutually exclusive

The account-list operation SHALL reject invocations where `dryRun.enabled` is true and recording mode is `record` or `replay`. The operation SHALL fail fast with a clear error before any pipeline phase executes.

#### Scenario: Dry-run with record mode rejected

- **GIVEN** connector configuration with `recording.mode: 'record'`
- **WHEN** account-list is invoked with `{ dryRun: { enabled: true } }`
- **THEN** the operation SHALL fail with an error indicating dry-run and record mode cannot be combined

#### Scenario: Dry-run with replay mode rejected

- **GIVEN** connector configuration with `recording.mode: 'replay'`
- **WHEN** account-list is invoked with `{ dryRun: { enabled: true } }`
- **THEN** the operation SHALL fail with an error indicating dry-run and replay mode cannot be combined

### Requirement: Dry-run counter simulation does not persist to tenant

In dry-run mode, incremental unique-attribute counters MAY advance in-memory during processing and output so projected attribute values match a persistent run. The operation SHALL NOT persist counter state or batch cumulative counts to the ISC tenant. Counter reads at setup (`initializeCounters`) SHALL remain real API reads.

#### Scenario: In-memory counters advance during dry-run output

- **GIVEN** a dry-run invocation with counter-based unique attribute definitions
- **WHEN** new Fusion accounts require generated unique values during output
- **THEN** in-memory counter state SHALL advance to produce projected values in streamed accounts

#### Scenario: Tenant counter state unchanged after dry-run

- **GIVEN** a dry-run invocation that advances in-memory counters
- **WHEN** the operation completes successfully
- **THEN** no `updateSource` PATCH for fusion state or batch cumulative counts SHALL reach the ISC tenant

---

## MODIFIED Requirements

### Requirement: Account list supports an optional dry-run input parameter

The account-list operation SHALL accept an optional `dryRun` input object with fields `enabled` (boolean, default false), `saveFile` (boolean, optional), and `sendEmail` (string or array of strings, optional). When `enabled` is true, the operation SHALL activate dry-run mode: full pipeline execution with write API calls inhibited at the client adapter.

#### Scenario: Platform invocation without dryRun parameter

- **WHEN** the account-list operation is invoked by the platform without the `dryRun` input parameter
- **THEN** the system SHALL execute a persistent aggregation, identical to current behavior

#### Scenario: Dry-run mode with enabled flag

- **WHEN** the account-list operation is invoked with `{ dryRun: { enabled: true } }`
- **THEN** the system SHALL execute all phases including Output account streaming
- **AND** ISC write API calls SHALL be inhibited at the DryRunApiAdapter without mutating the tenant

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

In dry-run mode, the account-list operation SHALL stream `StdAccountListOutput` rows via `res.send` that match persistent aggregation rows for the same ISC input state. Rows SHALL use the standard shape (`key`, `attributes`, `disabled`) and SHALL NOT carry legacy enrichment payloads (`matchingStatus`, `reportCategories`, `sourceStatus`, `correlationStatus`, `review`, synthetic `orphan-deferred:*` stubs).

#### Scenario: Dry-run row output shape matches aggregation output

- **WHEN** the account-list operation runs in dry-run mode
- **THEN** each streamed row SHALL contain only `key`, `attributes`, `disabled`, and standard `StdAccountListOutput` fields

#### Scenario: Dry-run rows include JIT unique attributes

- **GIVEN** Fusion accounts requiring unique attribute refresh during output
- **WHEN** the account-list operation runs in dry-run mode
- **THEN** streamed account rows SHALL include generated unique attribute values produced by the same JIT output path as persistent aggregation

### Requirement: Dry-run mode performs no write side effects

In dry-run mode, the account-list operation SHALL NOT mutate the ISC tenant. All ISC API write calls (PATCH, POST, DELETE, create/update/delete method names) SHALL be inhibited at the `DryRunApiAdapter` without delegating to the live SDK. Read API calls SHALL pass through to the tenant. Business logic that depends on write responses SHALL receive synthetic responses from the adapter shadow store so the pipeline can complete.

#### Scenario: Write API calls inhibited in dry-run

- **GIVEN** a dry-run invocation where the pipeline would create forms, correlate accounts, or patch source configuration
- **WHEN** the corresponding write API methods are invoked through `ClientService`
- **THEN** the live SDK SHALL NOT receive the write call
- **AND** the adapter SHALL return a synthetic response sufficient for downstream code to continue

#### Scenario: Read API calls pass through in dry-run

- **GIVEN** a dry-run invocation
- **WHEN** the pipeline fetches identities, accounts, forms, or source configuration
- **THEN** read API calls SHALL delegate to the live SDK unchanged

#### Scenario: Correlation-on-aggregation suppressed in dry-run

- **GIVEN** a managed source configured with `correlationMode: 'correlate'`
- **WHEN** the account-list operation runs in dry-run mode and missing accounts are detected
- **THEN** correlation logic SHALL execute in-process
- **AND** no correlation PATCH SHALL reach the ISC tenant

#### Scenario: Correlation-on-aggregation still runs in persistent mode

- **GIVEN** a managed source configured with `correlationMode: 'correlate'`
- **WHEN** the account-list operation runs a persistent aggregation and missing accounts are detected
- **THEN** correlation-on-aggregation SHALL execute and PATCH the ISC tenant as before

#### Scenario: Delayed-aggregation sender not fetched in dry-run

- **GIVEN** one or more sources configured for delayed aggregation
- **WHEN** the account-list operation runs in dry-run mode
- **THEN** the delayed-aggregation sender workflow SHALL NOT be fetched
