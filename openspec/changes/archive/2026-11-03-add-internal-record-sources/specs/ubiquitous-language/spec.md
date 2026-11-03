## ADDED Requirements

### Requirement: Internal Record terminology SHALL be canonical

Project code, configuration, documentation, and reports SHALL use **Internal Record source** for an external Record source packaged with the Records Customizer, **Internal-record dump** for its headered CSV input, and **INTERNAL badge** for report provenance that differentiates it from a configured managed source.

#### Scenario: New terms are available to project artifacts
- **GIVEN** a project artifact refers to packaged internal account data
- **WHEN** it names the source, file, or report provenance
- **THEN** it SHALL use Internal Record source, Internal-record dump, or INTERNAL badge as applicable
- **AND** it SHALL not use the retired terms internal source, CSV source, source record, raw account, or managed row for those concepts
