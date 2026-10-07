## ADDED Requirements

### Requirement: Glossary defines Duplicate Fusion account

The ubiquitous-language glossary SHALL define **Duplicate Fusion account** as a Fusion account that resolves to a Fusion identity that already has a registered Fusion account with a different account key (the managed account key, or the name-based fallback used for conflict tracking).

#### Scenario: Glossary entry for Duplicate Fusion account
- **GIVEN** a reader consults the ubiquitous-language glossary
- **WHEN** they look up how a second Fusion account for the same Fusion identity is named
- **THEN** it SHALL contain a **Duplicate Fusion account** entry
- **AND** the entry SHALL distinguish a duplicate (different account key) from an in-place update (same account key)
- **AND** the entry SHALL state it is typically caused by non-unique account names across sources

### Requirement: Glossary defines the Skip Fusion accounts with duplicate names setting

The ubiquitous-language glossary SHALL define **Skip Fusion accounts with duplicate names** as the Developer Setting (`skipDuplicateFusionAccounts`) that, when enabled, keeps the first registered Fusion account for a Fusion identity and skips later duplicates.

#### Scenario: Glossary entry for the Skip setting
- **GIVEN** a reader consults the ubiquitous-language glossary
- **WHEN** they look up the Developer Setting that skips duplicate Fusion accounts
- **THEN** it SHALL contain a **Skip Fusion accounts with duplicate names** entry
- **AND** the entry SHALL state its config key is `skipDuplicateFusionAccounts`
