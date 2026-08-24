## ADDED Requirements

### Requirement: Glossary defines Main account merge and Origin account merge

The ubiquitous-language glossary SHALL define **Main account merge**, **Origin account merge**, and **origin snapshot** as Map-step terms. Documentation and configuration labels SHALL use these names, not “Origin source” as a merge radio.

#### Scenario: Main account merge entry
- **GIVEN** a reader consults the ubiquitous-language glossary
- **WHEN** they look up the Map strategy that follows `mainAccount`
- **THEN** a **Main account merge** entry SHALL define it as the strategy that reads mapped values from the `mainAccount` snapshot when that key is found this run, otherwise from the origin snapshot, with stored config value `mainAccount`
- **AND** it SHALL NOT describe the strategy as First found with a preferred source

#### Scenario: Origin account merge entry
- **GIVEN** a reader consults the glossary
- **WHEN** they look up the Map strategy that follows creation provenance
- **THEN** an **Origin account merge** entry SHALL define it as the strategy that reads mapped values from the origin snapshot only, ignoring `mainAccount`, with stored config value `originAccount`

#### Scenario: Origin snapshot entry
- **GIVEN** a reader consults the glossary
- **WHEN** they look up the object those strategies read
- **THEN** an **origin snapshot** entry SHALL define it as the managed account whose key equals `originAccount`, or the Identities identity bag for identity-origin Fusion accounts
- **AND** it SHALL state that this is the same object Velocity exposes as `$account`

### Requirement: Glossary distinguishes Origin account merge from the $originSource Source-name token

The ubiquitous-language spec SHALL state that **Origin account merge** pins one origin snapshot, while the **$originSource** token in the Source name field resolves to the prioritized/`mainAccount` **source name** and then takes the first account on that source. Velocity `$originSource` remains the origin source **name** string in Define templates.

#### Scenario: Source-name token is not Origin account merge
- **GIVEN** documentation describes a per-attribute Source name of `$originSource`
- **WHEN** the prose refers to that setting
- **THEN** it SHALL call it the `$originSource` Source-name token
- **AND** it SHALL NOT call it Origin account merge
