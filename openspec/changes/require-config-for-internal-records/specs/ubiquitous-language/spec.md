## MODIFIED Requirements

### Requirement: Internal Record terminology SHALL be canonical

Project code, configuration, documentation, and reports SHALL use **Internal Record source** for a Record source packaged with the Records Customizer, named in the Internal Record configuration, and enabled in Source Settings with **Source type** set to **Records** and **Internal** toggled on, **Internal-record dump** for its headered CSV input, **Internal Record schema** for its saved field list, **Internal Record configuration** for the saved packaging decisions, and **INTERNAL badge** for report provenance that differentiates it from a configured managed source. An Internal Record source SHALL NOT be identified by a Source Settings file field.

#### Scenario: New terms are available to project artifacts

- **GIVEN** a project artifact refers to packaged internal account data
- **WHEN** it names the source, file, schema, configuration, or report provenance
- **THEN** it SHALL use Internal Record source, Internal-record dump, Internal Record schema, Internal Record configuration, or INTERNAL badge as applicable
- **AND** it SHALL NOT use the retired terms internal source, CSV source, source record, raw account, or managed row for those concepts

### Requirement: Glossary defines Internal Record configuration

The ubiquitous-language glossary SHALL define **Internal Record configuration** as the saved packaging decisions for the Internal Record sources in a Records Customizer package: source name, Internal Record schema, and Accounts JMESPath filter (without `includeRecordAccountsInMatch`, which is configured in Source Settings). Documentation and code SHALL NOT call this internal sources config or Source Settings.

#### Scenario: Internal Record configuration entry

- **GIVEN** a reader consults the ubiquitous-language spec glossary
- **WHEN** they look up the packaging decisions for Internal Record sources
- **THEN** an **Internal Record configuration** entry SHALL define it as those saved decisions
