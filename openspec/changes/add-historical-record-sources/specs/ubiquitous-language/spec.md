## ADDED Requirements

### Requirement: Historical Record terminology SHALL be canonical

Project code, configuration, documentation, and reports SHALL use **Historical Record source** for an external Record source packaged with the Unique Values Customizer, **historical-record dump** for its headered CSV input, and **INTERNAL badge** for report provenance that differentiates it from a configured managed source.

#### Scenario: New terms are available to project artifacts
- **GIVEN** a project artifact refers to packaged historical account data
- **WHEN** it names the source, file, or report provenance
- **THEN** it SHALL use Historical Record source, historical-record dump, or INTERNAL badge as applicable
- **AND** it SHALL not use the retired terms internal source, CSV source, source record, raw account, or managed row for those concepts
