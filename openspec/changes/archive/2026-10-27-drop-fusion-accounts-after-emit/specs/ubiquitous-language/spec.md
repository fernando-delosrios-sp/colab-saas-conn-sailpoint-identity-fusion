## ADDED Requirements

### Requirement: Glossary defines early emission and candidate record terms

The ubiquitous-language glossary SHALL define **Match Candidate Record** (a compact projection of an identity containing only identity identifiers and the attribute union needed for matching, review forms, and reporting) and **Early Account Emission** (an aggregation execution mode where accounts ready for ISC output are streamed to the connector response during identity assembly rather than held in-memory until Phase 5). Documentation and code SHALL NOT use synonyms like "lightweight bag" or "speculative emission".

#### Scenario: Match Candidate Record entry

- **GIVEN** a reader consults the ubiquitous-language spec glossary
- **WHEN** they look up how candidate identities are represented during the match sweep
- **THEN** a **Match Candidate Record** entry SHALL define it as a compact projection holding the identity identifier, display name, and the union of matching, form, and report attributes
- **AND** it SHALL state that candidate records replace full FusionAccount instances in the matching roster

#### Scenario: Early Account Emission entry

- **GIVEN** a reader consults the ubiquitous-language spec glossary
- **WHEN** they look up how the connector drops accounts after emitting during identity processing
- **THEN** an **Early Account Emission** entry SHALL define it as streaming accounts during identity processing and dropping full FusionAccount objects prior to the match sweep
- **AND** it SHALL specify that auto-matched accounts are rebuilt on-demand via the ISC API and re-emitted
