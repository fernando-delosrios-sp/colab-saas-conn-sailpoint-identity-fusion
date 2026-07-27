## ADDED Requirements

### Requirement: Account-list operational milestones use DETAIL lines

During account-list execution, operational milestones (managed sources loaded, accounts collected per source, workflow resolution, mode selection) SHALL be emitted as `DETAIL` lines rather than free-form INFO prose. Email sends SHALL emit a single `DETAIL email sent` line per invocation with `subject`, `recipients`, and optional `formId`. Batch email activity during uncorrelated sweep SHALL additionally be summarized via `EVENT_SUMMARY email=+N/interval`.

#### Scenario: Source collection logged as DETAIL

- **GIVEN** a managed source finishes account collection
- **WHEN** the fetch phase records the result
- **THEN** the connector host SHALL receive a DETAIL line including `source=` and `collected=` keys
- **AND** the line SHALL NOT match free-form prose `Source X: collected N account(s)`

#### Scenario: Single email detail line per send

- **GIVEN** a fusion review email is sent during uncorrelated sweep
- **WHEN** the email workflow completes successfully
- **THEN** exactly one DETAIL line describing the send SHALL appear at INFO level
- **AND** no second INFO line describing the same send SHALL appear

---

## MODIFIED Requirements

### Requirement: Account-list pipeline logs phase and step boundaries

The account-list operation SHALL emit PHASE START and PHASE END lines at each major phase boundary (Setup, Fetch, Refresh, Process, Output) and STEP START/END lines at named sub-steps within Process and Output (including identity processing, **managed account initialization**, **orphan identity hydration**, correlated sweep, **record unique registration**, uncorrelated sweep, await-disable-ops, form reconciliation, **clear managed accounts** (Output, non-record mode only), form cleanup, send-accounts, save-state, schedule-aggregations, await-form-deletes). PHASE END lines SHALL include `elapsed=` duration. Phase timing data for HTML report breakdowns SHALL be captured internally without emitting colon-style `PHASE N: Description (elapsed)` host lines.

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

---

## REMOVED Requirements

_(none)_
