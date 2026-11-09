## ADDED Requirements

### Requirement: Records Customizer SHALL expose packaged internal records

The Records Customizer `beforeStdAccountList` hook SHALL retain the existing `customizerIndicesDir` contract and SHALL additionally provide the absolute location of the internal-record manifest and artifacts when they are packaged. A package without internal records SHALL remain valid.

#### Scenario: Hook provides both optional customizer payloads
- **GIVEN** a customizer package containing unique-value indexes and an internal-record manifest
- **WHEN** Identity Security Cloud invokes `beforeStdAccountList`
- **THEN** the returned input SHALL include `customizerIndicesDir`
- **AND** it SHALL include the resolved internal-record package location

#### Scenario: Existing index-only package remains compatible
- **GIVEN** a customizer package containing only unique-value indexes
- **WHEN** Identity Security Cloud invokes `beforeStdAccountList`
- **THEN** the hook SHALL provide the index directory as before
- **AND** the connector SHALL not treat the absence of internal-record artifacts as an error
