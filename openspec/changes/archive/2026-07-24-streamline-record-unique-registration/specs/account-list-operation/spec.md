## MODIFIED Requirements

### Requirement: Account-list pipeline logs phase and step boundaries

The account-list operation SHALL emit PHASE and STEP START lines at the beginning of each major phase (Setup, Fetch, Refresh, Process, Output) and at named sub-steps within Process and Output (including identity processing, correlated sweep, **record unique registration**, uncorrelated sweep, await-disable-ops, form reconciliation, form cleanup, send-accounts, save-state, schedule-aggregations, await-form-deletes). Phase completion timing lines SHALL remain for report phase-timing breakdown.

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

## ADDED Requirements

### Requirement: Account-list process phase runs record unique registration before uncorrelated sweep

The account-list Process phase SHALL run record unique registration after the correlated managed-account sweep and before the uncorrelated match sweep. Accounts handled in this step SHALL be removed from the managed-account work queue.

#### Scenario: Uncorrelated sweep queue excludes pre-registered record accounts

- **GIVEN** 5000 record-only accounts with match disabled and 200 authoritative uncorrelated accounts
- **WHEN** record unique registration completes
- **THEN** the uncorrelated sweep SHALL process approximately 200 accounts
- **AND** STATUS for uncorrelated sweep SHALL NOT count the 5000 record-only accounts
