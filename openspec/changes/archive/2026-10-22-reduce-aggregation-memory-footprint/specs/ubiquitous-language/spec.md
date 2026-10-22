## ADDED Requirements

### Requirement: Glossary defines attribute pruning terms

The ubiquitous-language glossary SHALL define **Attribute pruning** (dropping managed source account `attributes` outside the referenced attribute set during Bulk ingest; never applied to raw Fusion accounts) and **Referenced attribute set** (the run-scoped union of attributes pruning keeps). Documentation and specs SHALL NOT call pruning "stripping", "trimming", or "slimming", nor the referenced attribute set a "keep-list" or "allowlist".

#### Scenario: Attribute pruning entry

- **GIVEN** a reader consults the ubiquitous-language spec glossary
- **WHEN** they look up how the connector reduces managed source account payloads at Fetch
- **THEN** an **Attribute pruning** entry SHALL define it as dropping managed source account attributes outside the referenced attribute set during Bulk ingest
- **AND** it SHALL state that pruning applies to managed source accounts only and runs after all fetch filters

#### Scenario: Referenced attribute set entry

- **GIVEN** a reader consults the ubiquitous-language spec glossary
- **WHEN** they look up which managed source account attributes survive pruning
- **THEN** a **Referenced attribute set** entry SHALL list its constituent sources (schema names, mapping `existingAttributes`, template textual references, match rule attributes)
- **AND** it SHALL state the set is computed once per run as a union across all managed sources
