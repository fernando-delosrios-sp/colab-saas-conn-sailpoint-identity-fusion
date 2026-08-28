## ADDED Requirements

### Requirement: Glossary defines vanished snapshot key and definition-owned name

The ubiquitous-language glossary SHALL define **vanished snapshot key** and **definition-owned name** as Map-step terms. Documentation SHALL NOT describe implicit Map as overwrite-only, and SHALL NOT use "orphaned attribute" or "stale attribute" for a vanished snapshot key, because **Orphan** already denotes a Fusion account with no contributing managed source accounts.

#### Scenario: Vanished snapshot key entry

- **GIVEN** a reader consults the ubiquitous-language glossary
- **WHEN** they look up names Map removes on refresh
- **THEN** a **vanished snapshot key** entry SHALL define it as an attribute name present in `attributeBag.current` that no live snapshot in the current `mapAttributes` invocation carries, that is not an `attributeMaps[].newAttribute` target, and that is not a definition-owned name or a denylisted control or overlay key
- **AND** it SHALL state that such a key is deleted from `attributeBag.current`
- **AND** it SHALL NOT use "orphaned attribute" or "stale attribute" as a synonym

#### Scenario: Definition-owned name entry

- **GIVEN** a reader consults the glossary
- **WHEN** they look up why Map leaves Velocity outputs alone
- **THEN** a **definition-owned name** entry SHALL define it as an attribute name configured as a `normalAttributeDefinitions` or `uniqueAttributeDefinitions` entry name
- **AND** it SHALL state that Map neither merges nor clears such a name as an implicit candidate, while an explicit attribute mapping row still applies

---

## MODIFIED Requirements

### Requirement: Glossary defines unmapped snapshot key and Identities snapshot

The ubiquitous-language glossary SHALL define **unmapped snapshot key** and **Identities snapshot** as Map-step terms. Documentation SHALL NOT describe unmapped Fusion schema names as mapping targets. The glossary SHALL state that implicit Map candidates are unmapped snapshot keys together with names already present in `attributeBag.current`.

#### Scenario: Unmapped snapshot key entry

- **GIVEN** a reader consults the ubiquitous-language glossary
- **WHEN** they look up names Map merges without an attribute mapping row
- **THEN** an **unmapped snapshot key** entry SHALL define it as an attribute name that appears on at least one live snapshot in the current `mapAttributes` invocation and is not an `attributeMaps[].newAttribute` mapping target
- **AND** it SHALL NOT define the term as every Fusion schema attribute
- **AND** it SHALL cross-reference **vanished snapshot key** for names that have left every live snapshot

#### Scenario: Identities snapshot entry

- **GIVEN** a reader consults the glossary
- **WHEN** they look up how the identity bag participates in Map
- **THEN** an **Identities snapshot** entry SHALL define it as the identity bag registered in the source attribute map and snapshot-key index under the identity id, treated as another contributing account
- **AND** it SHALL NOT describe identity-origin as a separate merge algebra
