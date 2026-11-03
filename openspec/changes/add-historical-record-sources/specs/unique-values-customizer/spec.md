## ADDED Requirements

### Requirement: Unique Values Customizer SHALL expose packaged historical records

The Unique Values Customizer `beforeStdAccountList` hook SHALL retain the existing `customizerIndicesDir` contract and SHALL additionally provide the absolute location of the historical-record manifest and artifacts when they are packaged. A package without historical records SHALL remain valid.

#### Scenario: Hook provides both optional customizer payloads
- **GIVEN** a customizer package containing unique-value indexes and a historical-record manifest
- **WHEN** Identity Security Cloud invokes `beforeStdAccountList`
- **THEN** the returned input SHALL include `customizerIndicesDir`
- **AND** it SHALL include the resolved historical-record package location

#### Scenario: Existing index-only package remains compatible
- **GIVEN** a customizer package containing only unique-value indexes
- **WHEN** Identity Security Cloud invokes `beforeStdAccountList`
- **THEN** the hook SHALL provide the index directory as before
- **AND** the connector SHALL not treat the absence of historical-record artifacts as an error
