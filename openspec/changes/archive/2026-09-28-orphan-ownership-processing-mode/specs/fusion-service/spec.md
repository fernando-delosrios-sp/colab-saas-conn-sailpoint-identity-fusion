## ADDED Requirements

### Requirement: Ownership reviewer selection sets the owner identity

When a reviewer selects an existing identity for an Ownership-eligible account, the connector SHALL set that account's owner identity to the selected identity. The connector SHALL NOT change the account's correlated identity. The connector SHALL NOT add the machine account as a contributing or missing account on a Fusion account. The source correlation mode SHALL NOT cause a correlation for that account.

#### Scenario: Reviewer selection writes the owner identity

- **GIVEN** a finished review decision that selects an existing identity
- **AND** the decision's account is an Ownership-eligible machine account with no established owner identity
- **WHEN** the connector applies the decision
- **THEN** the machine account's owner identity SHALL be the selected identity
- **AND** the machine account's correlated identity SHALL be unchanged
- **AND** the machine account SHALL NOT be a contributing account on a Fusion account

#### Scenario: Assignment-mode reviewer selection still correlates

- **GIVEN** a finished review decision that selects an existing identity
- **AND** the decision's account is from an Orphan source in Assignment mode
- **AND** that source's correlation mode correlates missing accounts
- **WHEN** the connector applies the decision
- **THEN** the connector SHALL correlate the account to the selected identity
- **AND** the connector SHALL NOT set an owner identity on that account

### Requirement: Ownership reviewer no-match drops the account

When a reviewer records no match for an Ownership-eligible account, the connector SHALL drop the account and SHALL NOT set an owner identity. When Disable non-matching accounts is enabled for that source, the connector SHALL queue a disable for the account. When that toggle is off, the connector SHALL NOT disable the account.

#### Scenario: Reviewer no-match does not set an owner identity

- **GIVEN** a finished review decision that records no match
- **AND** the decision's account is an Ownership-eligible machine account
- **AND** Disable non-matching accounts is off
- **WHEN** the connector applies the decision
- **THEN** the account SHALL NOT gain an owner identity
- **AND** the account SHALL NOT be disabled

#### Scenario: Reviewer no-match queues disable when configured

- **GIVEN** a finished review decision that records no match
- **AND** the decision's account is an Ownership-eligible machine account
- **AND** Disable non-matching accounts is on
- **WHEN** the connector applies the decision
- **THEN** a disable SHALL be queued for that account
- **AND** the account SHALL NOT gain an owner identity
