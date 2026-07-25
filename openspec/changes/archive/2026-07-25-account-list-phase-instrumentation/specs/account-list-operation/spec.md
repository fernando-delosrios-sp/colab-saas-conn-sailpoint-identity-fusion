## MODIFIED Requirements

### Requirement: Account-list pipeline logs phase and step boundaries

The account-list operation SHALL emit PHASE and STEP START lines at the beginning of each major phase (Setup, Fetch, Refresh, Process, Output) and at named sub-steps within Process and Output (including identity processing, **managed account initialization**, **orphan identity hydration**, correlated sweep, **record unique registration**, uncorrelated sweep, await-disable-ops, form reconciliation, **clear managed accounts** (Output, non-record mode only), form cleanup, send-accounts, save-state, schedule-aggregations, await-form-deletes). Phase completion timing lines SHALL remain for report phase-timing breakdown.

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
