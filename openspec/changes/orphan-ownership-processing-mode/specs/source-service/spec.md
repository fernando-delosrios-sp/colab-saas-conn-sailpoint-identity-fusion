## ADDED Requirements

### Requirement: Orphan processing mode defaults to Assignment

An Orphan accounts source SHALL have an Orphan processing mode of Assignment mode or Ownership mode. When `orphanProcessingMode` is omitted, the source SHALL be Assignment mode. Authoritative and Records sources SHALL NOT gain this setting. The connector configuration SHALL present Assignment and Ownership as radio options only when Source type is Orphan accounts, with Assignment as the default.

#### Scenario: Omitted processing mode is Assignment

- **GIVEN** an Orphan accounts source with no `orphanProcessingMode` value
- **WHEN** the connector reads that source's configuration
- **THEN** the source SHALL be in Assignment mode

#### Scenario: Ownership is selected explicitly

- **GIVEN** an Orphan accounts source with `orphanProcessingMode` `ownership`
- **WHEN** the connector reads that source's configuration
- **THEN** the source SHALL be in Ownership mode

### Requirement: Ownership mode fetches only unowned machine accounts

For an Ownership-mode source, the connector SHALL register a fetched managed source account only when it is a machine account and it has no established owner identity. The connector SHALL register those accounts whether or not they are already correlated. A non-machine account, and a machine account with an established owner identity, SHALL NOT be registered, SHALL NOT be scored, SHALL NOT be correlated, and SHALL NOT be disabled. Those skipped accounts SHALL NOT count toward the source's aggregation batch size.

#### Scenario: Unowned machine account is registered even when correlated

- **GIVEN** an Ownership-mode source
- **AND** a machine account on that source with no established owner identity
- **AND** the account is already correlated to an identity
- **WHEN** the connector fetches accounts for that source
- **THEN** the account SHALL be registered for processing

#### Scenario: Unowned uncorrelated machine account is registered

- **GIVEN** an Ownership-mode source
- **AND** a machine account on that source with no established owner identity
- **AND** the account is uncorrelated
- **WHEN** the connector fetches accounts for that source
- **THEN** the account SHALL be registered for processing

#### Scenario: Machine account with an established owner identity is skipped

- **GIVEN** an Ownership-mode source
- **AND** a machine account whose `ownerIdentity.id` is a non-empty string
- **WHEN** the connector fetches accounts for that source
- **THEN** the account SHALL NOT be registered for processing
- **AND** the account SHALL NOT be disabled

#### Scenario: Non-machine account on an Ownership source is skipped

- **GIVEN** an Ownership-mode source
- **AND** a managed source account with `isMachine` not true
- **WHEN** the connector fetches accounts for that source
- **THEN** the account SHALL NOT be registered for processing
- **AND** the account SHALL NOT be disabled

### Requirement: Assignment mode still discards machine accounts

Assignment-mode Orphan sources, Authoritative sources, and Records sources SHALL discard machine accounts after fetch. Those accounts SHALL NOT be registered for processing.

#### Scenario: Assignment-mode Orphan source discards a machine account

- **GIVEN** an Orphan accounts source in Assignment mode
- **AND** a machine account on that source
- **WHEN** the connector fetches accounts for that source
- **THEN** the machine account SHALL NOT be registered for processing

#### Scenario: Authoritative source discards a machine account

- **GIVEN** an Authoritative source
- **AND** a machine account on that source
- **WHEN** the connector fetches accounts for that source
- **THEN** the machine account SHALL NOT be registered for processing
