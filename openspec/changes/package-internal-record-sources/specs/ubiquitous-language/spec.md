## ADDED Requirements

### Requirement: Glossary defines Internal Record schema

The ubiquitous-language glossary SHALL define **Internal Record schema** as the saved field list for one Internal Record source, including the Account ID field, the Account Name field, and which fields are multi-valued. Documentation and code SHALL NOT call this a discovered schema or an inferred type.

#### Scenario: Internal Record schema entry
- **GIVEN** a reader consults the ubiquitous-language spec glossary
- **WHEN** they look up the saved fields of an Internal Record source
- **THEN** an **Internal Record schema** entry SHALL define it as that field list, including Account ID, Account Name, and multi-valued fields

### Requirement: Glossary defines Internal Record configuration

The ubiquitous-language glossary SHALL define **Internal Record configuration** as the saved packaging decisions for the Internal Record sources in a Records Customizer package: source name, Internal Record schema, Include record accounts in Match, and Accounts JMESPath filter. Documentation and code SHALL NOT call this internal sources config or Source Settings.

#### Scenario: Internal Record configuration entry
- **GIVEN** a reader consults the ubiquitous-language spec glossary
- **WHEN** they look up the packaging decisions for Internal Record sources
- **THEN** an **Internal Record configuration** entry SHALL define it as those saved decisions

## MODIFIED Requirements

### Requirement: Glossary defines Customizer Value Store and Records Customizer

The ubiquitous-language glossary SHALL define **Records Customizer** as the standalone SailPoint SaaS Connectivity customizer project that packages Internal-record dumps and the Internal Record configuration for Identity Fusion. The glossary SHALL state that the **Customizer Value Store** is retired and SHALL NOT define it as a current binary index of reserved unique values. Documentation and code SHALL NOT refer to a reserved-value index as a static cache or disk table.

#### Scenario: Customizer Value Store entry
- **REMOVED** — superseded by **Customizer Value Store is retired**. The glossary no longer defines a current hash index of reserved values.

#### Scenario: Records Customizer entry
- **GIVEN** a reader consults the ubiquitous-language spec glossary
- **WHEN** they look up the customizer package
- **THEN** a **Records Customizer** entry SHALL define it as the project that packages Internal-record dumps and the Internal Record configuration

#### Scenario: Customizer Value Store is retired
- **GIVEN** a reader consults the ubiquitous-language spec glossary
- **WHEN** they look up the Customizer Value Store
- **THEN** the entry SHALL state that it is retired
- **AND** it SHALL NOT describe a current hash index of reserved values

### Requirement: Internal Record terminology SHALL be canonical

Project code, configuration, documentation, and reports SHALL use **Internal Record source** for a Record source packaged with the Records Customizer and named in the Internal Record configuration, **Internal-record dump** for its headered CSV input, **Internal Record schema** for its saved field list, **Internal Record configuration** for the saved packaging decisions, and **INTERNAL badge** for report provenance that differentiates it from a configured managed source. An Internal Record source SHALL NOT be identified by a Source Settings file field.

#### Scenario: New terms are available to project artifacts
- **GIVEN** a project artifact refers to packaged internal account data
- **WHEN** it names the source, file, schema, configuration, or report provenance
- **THEN** it SHALL use Internal Record source, Internal-record dump, Internal Record schema, Internal Record configuration, or INTERNAL badge as applicable
- **AND** it SHALL NOT use the retired terms internal source, CSV source, source record, raw account, or managed row for those concepts
