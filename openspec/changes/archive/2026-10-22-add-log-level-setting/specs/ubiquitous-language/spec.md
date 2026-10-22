## ADDED Requirements

### Requirement: Glossary defines Log Settings and Log level

The ubiquitous-language glossary SHALL define **Log Settings** as the Advanced Settings section that exposes the connector's host-log verbosity, and **Log level** as the minimum severity the connector writes to the ISC host log, ordered `debug < info < warn < error` with options Error, Warn, Info, and Debug and a default of Info. The **Log level** definition SHALL be distinguished from **External logging level**, which governs external delivery only.

#### Scenario: Glossary entry for Log level

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Log level** entry
- **AND** the entry SHALL state that it is the minimum severity written to the ISC host log
- **AND** the entry SHALL list the options Error, Warn, Info, and Debug with a default of Info

#### Scenario: Glossary entry for Log Settings

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Log Settings** entry identifying it as the Advanced Settings section that exposes the Log level

#### Scenario: Log level is distinguished from External logging level

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** the **Log level** entry SHALL NOT be defined as the external delivery threshold
- **AND** the glossary SHALL retain **External logging level** as the separate external-delivery term
