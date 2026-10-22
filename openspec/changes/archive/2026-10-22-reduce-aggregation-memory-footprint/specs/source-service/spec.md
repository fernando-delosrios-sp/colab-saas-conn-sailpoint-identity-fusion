## ADDED Requirements

### Requirement: Managed source account attribute pruning at Bulk ingest

The source service SHALL prune each managed source account's `attributes` to the **referenced attribute set** during Bulk ingest, before work-queue registration. Pruning is enforced (no configuration surface disables it), runs after all fetch filters and the machine-account discard, and applies to managed source accounts only — never raw Fusion accounts. The work queue, claimed account retention, and source snapshot materialization SHALL carry only the pruned body.

#### Scenario: Referenced attribute set initialized per pipeline

- **WHEN** the account-list or Fusion report pipeline completes Setup
- **THEN** the referenced attribute set SHALL be initialized and managed source account pruning SHALL apply at Bulk ingest
- **AND** single-account operations SHALL NOT initialize the set

#### Scenario: Referenced attribute set composition

- **WHEN** the referenced attribute set is computed for a run
- **THEN** it SHALL be the union of every Fusion schema attribute name, every `attributeMaps[].existingAttributes` entry, every attribute name textually referenced in Normal/Unique definition and form Velocity templates (dot, bracket, and quoted styles), and every match rule attribute name

#### Scenario: Unreferenced attributes dropped at ingest

- **GIVEN** a managed source account whose `attributes` contain 50 keys
- **AND** 8 of those keys are in the referenced attribute set
- **WHEN** the account is ingested during Fetch
- **THEN** the work queue SHALL hold only the 8 referenced attributes plus system fields
- **AND** claimed account retention and source snapshot materialization for that account SHALL expose only the pruned attributes

#### Scenario: Unmapped schema-named attribute kept

- **GIVEN** a managed source account attribute named `email`
- **AND** `email` is a Fusion schema attribute with no explicit attribute mapping row
- **WHEN** the referenced attribute set is computed
- **THEN** `email` SHALL be in the set so implicit Map merge parity is preserved

#### Scenario: Template-referenced attribute kept

- **GIVEN** a Normal definition whose Velocity template reads `$sources.get('AD')[0].department`
- **AND** `department` has no attribute mapping row and is not a Fusion schema attribute
- **WHEN** the referenced attribute set is computed
- **THEN** `department` SHALL be in the set

#### Scenario: Bracket and quoted template references kept

- **GIVEN** a Unique definition whose Velocity template reads `$accounts[0]['custom-attr']` and `$account.employeeNumber`
- **WHEN** the referenced attribute set is computed
- **THEN** `custom-attr` and `employeeNumber` SHALL be in the set

#### Scenario: Filters evaluate before pruning

- **GIVEN** a managed source with an Accounts JMESPath filter that references an attribute outside the referenced attribute set
- **WHEN** accounts are fetched
- **THEN** the filter SHALL still include or exclude accounts exactly as before pruning was introduced

#### Scenario: Machine account discard precedes pruning

- **GIVEN** a managed machine account (`isMachine=true`) on a source that discards machine accounts
- **WHEN** the account is fetched
- **THEN** it SHALL be discarded before pruning work is spent on it

#### Scenario: Record mode captures raw pages and prunes at registration

- **GIVEN** recording mode `record`
- **WHEN** managed source accounts are fetched
- **THEN** the recorded API capture SHALL contain the raw unpruned pages
- **AND** the registered work-queue bodies SHALL be pruned exactly as in a live run

#### Scenario: Single-account operations ingest unpruned bodies

- **GIVEN** a single-account operation (for example account-read) that never initializes the referenced attribute set
- **WHEN** a managed source account is fetched for that operation
- **THEN** the account body SHALL be registered unpruned, matching pre-change behavior
