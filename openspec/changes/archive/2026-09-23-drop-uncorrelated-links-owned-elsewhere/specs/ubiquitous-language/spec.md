## ADDED Requirements

### Requirement: Glossary defines foreign-owned managed account

The ubiquitous-language glossary SHALL define **Foreign-owned managed account** as a Refresh FusionLayers term: a managed source account whose **current** ISC `identityId` is a different loaded **Fusion identity** than the Fusion account currently under Refresh. A Fusion listing in accounts, missing-accounts, or previous keys does not establish ownership by itself. Documentation and specs SHALL NOT call this a vanished snapshot key, prune-deleted inventory miss, skip-linked Match drop, or ownership by a NonMatched Fusion account alone.

#### Scenario: Foreign-owned managed account entry

- **GIVEN** a reader consults the ubiquitous-language glossary
- **WHEN** they look up a managed source account that belongs to another Fusion identity during Refresh
- **THEN** a **Foreign-owned managed account** entry SHALL define it as a managed source account whose current ISC `identityId` is a different loaded Fusion identity than the Fusion account currently under Refresh
- **AND** it SHALL NOT treat a Fusion listing as ownership by itself
- **AND** it SHALL NOT treat a NonMatched Fusion account as the owner by itself
- **AND** it SHALL NOT use prune-deleted inventory absence as the definition
