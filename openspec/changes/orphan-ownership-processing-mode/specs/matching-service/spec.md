## ADDED Requirements

### Requirement: Ownership-eligible accounts enter Match scoring

An Ownership-eligible account SHALL enter Match scoring even when it is already correlated and even when it is already linked on a Fusion account. The correlated non-match shortcut and the already-linked skip SHALL NOT apply to it. After scoring, the account SHALL leave the managed-account work queue so it is not scored again in the same run.

#### Scenario: Correlated unowned machine account is scored

- **GIVEN** an Ownership-mode source
- **AND** a registered machine account with no established owner identity
- **AND** the account is already correlated to an identity
- **WHEN** Match runs for that account
- **THEN** the account SHALL be scored against identity candidates
- **AND** it SHALL NOT be treated as a non-match solely because it is correlated

#### Scenario: Fusion-linked unowned machine account is scored

- **GIVEN** an Ownership-mode source
- **AND** a registered machine account with no established owner identity
- **AND** the account is already linked on a Fusion account
- **WHEN** Match runs for that account
- **THEN** the account SHALL be scored against identity candidates
- **AND** it SHALL NOT be dropped solely because it is already linked

### Requirement: Ownership automatic merge sets the owner identity

When an Ownership-eligible account meets the automatic merge threshold, the connector SHALL set that account's owner identity to the selected identity. The connector SHALL NOT change the account's correlated identity. The connector SHALL NOT add the machine account as a contributing or missing account on a Fusion account. The source correlation mode SHALL NOT cause a correlation for that account.

#### Scenario: Automatic merge writes the owner identity

- **GIVEN** an Ownership-eligible machine account with no established owner identity
- **AND** one identity meets the automatic merge threshold
- **WHEN** Match assigns that identity
- **THEN** the machine account's owner identity SHALL be that identity
- **AND** the machine account's correlated identity SHALL be unchanged
- **AND** the machine account SHALL NOT be a contributing account on a Fusion account

### Requirement: Ownership non-match drops the account

When an Ownership-eligible account has no identity candidate that meets the match threshold, the connector SHALL drop the account and SHALL NOT set an owner identity. When Disable non-matching accounts is enabled for that source, the connector SHALL queue a disable for the account. When that toggle is off, the connector SHALL NOT disable the account.

#### Scenario: Non-match does not set an owner identity

- **GIVEN** an Ownership-eligible machine account
- **AND** no identity candidate meets the match threshold
- **AND** Disable non-matching accounts is off
- **WHEN** Match finishes for that account
- **THEN** the account SHALL NOT gain an owner identity
- **AND** the account SHALL NOT be disabled

#### Scenario: Non-match queues disable when configured

- **GIVEN** an Ownership-eligible machine account
- **AND** no identity candidate meets the match threshold
- **AND** Disable non-matching accounts is on
- **WHEN** Match finishes for that account
- **THEN** a disable SHALL be queued for that account
- **AND** the account SHALL NOT gain an owner identity
