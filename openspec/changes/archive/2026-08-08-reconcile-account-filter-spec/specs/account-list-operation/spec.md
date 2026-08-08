## MODIFIED Requirements

### Requirement: Account list streams all accounts

The system SHALL stream all available accounts when the account-list operation is invoked. In dry-run mode (`dryRun.enabled: true`), the system SHALL stream all accounts non-persistently without modifying state. Managed account scope SHALL be narrowed only by source configuration filters applied during Fetch (see source-service spec for Accounts API filter and Accounts JMESPath filter). Account-list SHALL NOT accept or honor list-input filter criteria on `StdAccountListInput`.

#### Scenario: Successful account listing

- **WHEN** the account-list operation is invoked
- **THEN** the system SHALL stream all fusion accounts eligible for output from the scoped aggregation run

#### Scenario: Account listing with filters

- **REMOVED** — superseded by **Accounts API filter narrows managed fetch scope during account-list**. Original wording incorrectly implied list-input filter criteria; intent is source configuration Accounts API filter applied at Fetch time.

#### Scenario: Accounts API filter narrows managed fetch scope during account-list

- **GIVEN** a managed source configured with an Accounts API filter (`accountFilter`)
- **WHEN** the account-list operation runs Fetch phase
- **THEN** the source service SHALL apply the filter server-side when calling the ISC Accounts API
- **AND** managed accounts excluded by the filter SHALL NOT enter the work queue, matching pipeline, or output as new rows from that source fetch
- **AND** scope narrowing SHALL NOT rely on list-input filter criteria on the account-list invocation

#### Scenario: Successful dry-run listing

- **WHEN** the account-list operation is invoked in dry-run mode
- **THEN** the system SHALL stream all eligible fusion accounts without persisting any state changes
