## ADDED Requirements

### Requirement: Glossary defines Orphan processing mode terms

The ubiquitous-language glossary SHALL define **Orphan processing mode** as the per-source setting on an Orphan accounts source that chooses Assignment mode or Ownership mode. It SHALL define **Assignment mode** as the Orphan processing mode that keeps today's orphan Match behavior: uncorrelated non-machine accounts are scored, and a selected identity is correlated. It SHALL define **Ownership mode** as the Orphan processing mode whose eligible population is machine accounts with no owner identity, and whose selected identity is that account's owner identity. **Assignment mode** SHALL NOT be used as a name for **Automatic assignment**.

#### Scenario: Glossary defines Orphan processing mode

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain an **Orphan processing mode** entry
- **AND** the entry SHALL state that the setting applies to an Orphan accounts source and chooses Assignment mode or Ownership mode

#### Scenario: Glossary defines Assignment mode apart from automatic assignment

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain an **Assignment mode** entry describing the current orphan Match and correlation behavior
- **AND** it SHALL keep **Automatic assignment** as the Match threshold decision
- **AND** it SHALL NOT define **Assignment mode** as **Automatic assignment**

#### Scenario: Glossary defines Ownership mode

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain an **Ownership mode** entry
- **AND** the entry SHALL state that the eligible population is machine accounts with no owner identity
- **AND** the entry SHALL state that the selected identity is that account's owner identity

### Requirement: Glossary defines machine account owner identity

The ubiquitous-language glossary SHALL define **Machine account** as a managed source account with `isMachine` true. It SHALL define **Owner identity** as the ISC identity referenced by a machine account's `ownerIdentity`, distinct from the correlated identity (`identityId`) and from the Fusion source owner. It SHALL define **Established owner identity** as an owner identity whose `id` is a non-empty string. A missing `ownerIdentity`, or one without an id, is not established.

#### Scenario: Glossary defines Machine account

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Machine account** entry
- **AND** the entry SHALL state that a machine account is a managed source account with `isMachine` true

#### Scenario: Glossary defines Owner identity apart from the Fusion source owner

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain an **Owner identity** entry
- **AND** the entry SHALL state that it is the identity referenced by `ownerIdentity` on a machine account
- **AND** the entry SHALL state that it is distinct from the correlated identity and from the Fusion source owner

#### Scenario: Glossary defines Established owner identity

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain an **Established owner identity** entry
- **AND** the entry SHALL require a non-empty `id`
- **AND** the entry SHALL state that a missing `ownerIdentity`, or one without an id, is not established
