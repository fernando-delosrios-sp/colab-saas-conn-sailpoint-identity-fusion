## ADDED Requirements

### Requirement: Glossary defines identity pruning terms

The ubiquitous-language glossary SHALL define **Identity Document Pruning** (dropping unreferenced attributes from `identity.attributes` upon page arrival during identity fetch) and **Identity Account Filtering** (filtering `identity.accounts` to retain only accounts belonging to configured Fusion and managed sources). Documentation and code SHALL NOT refer to identity pruning as "identity trimming" or "account purging".

#### Scenario: Identity Document Pruning entry

- **GIVEN** a reader consults the ubiquitous-language spec glossary
- **WHEN** they look up how the connector reduces identity memory at Fetch
- **THEN** an **Identity Document Pruning** entry SHALL define it as dropping unreferenced attributes outside the referenced attribute set on page arrival
- **AND** it SHALL state that core identity fields and configured references are always preserved

#### Scenario: Identity Account Filtering entry

- **GIVEN** a reader consults the ubiquitous-language spec glossary
- **WHEN** they look up how linked accounts on identities are handled
- **THEN** an **Identity Account Filtering** entry SHALL define it as filtering the `identity.accounts` list to only the Fusion source and managed sources
- **AND** it SHALL specify that external third-party accounts are discarded immediately on ingest
