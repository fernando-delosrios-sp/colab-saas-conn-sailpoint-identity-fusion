## MODIFIED Requirements

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

## ADDED Requirements

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
