## ADDED Requirements

### Requirement: Glossary defines unmapped snapshot key and Identities snapshot

The ubiquitous-language glossary SHALL define **unmapped snapshot key** and **Identities snapshot** as Map-step terms. Documentation SHALL NOT describe unmapped Fusion schema names as mapping targets.

#### Scenario: Unmapped snapshot key entry

- **GIVEN** a reader consults the ubiquitous-language glossary
- **WHEN** they look up names Map merges without an attribute mapping row
- **THEN** an **unmapped snapshot key** entry SHALL define it as an attribute name that appears on at least one live snapshot in the current `mapAttributes` invocation and is not an `attributeMaps[].newAttribute` mapping target
- **AND** it SHALL NOT define the term as every Fusion schema attribute

#### Scenario: Identities snapshot entry

- **GIVEN** a reader consults the glossary
- **WHEN** they look up how the identity bag participates in Map
- **THEN** an **Identities snapshot** entry SHALL define it as the identity bag registered in the source attribute map and snapshot-key index under the identity id, treated as another contributing account
- **AND** it SHALL NOT describe identity-origin as a separate merge algebra

---

## MODIFIED Requirements

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
- **THEN** an **origin snapshot** entry SHALL define it as the snapshot whose key equals `originAccount` in the snapshot-key index, including the Identities snapshot when that key is the identity id
- **AND** it SHALL state that this is the same object Velocity exposes as `$account`
