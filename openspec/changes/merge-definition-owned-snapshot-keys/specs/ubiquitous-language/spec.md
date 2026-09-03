## ADDED Requirements

### Requirement: Glossary defines pass-through definition

The ubiquitous-language glossary SHALL define **pass-through definition** as a Define-step term: a Normal attribute definition whose expression reads its own name, so Define transforms a value Map seeded into `attributeBag.current` from the same-named snapshot key. Documentation SHALL NOT call this an identity mapping or a copy definition. The glossary SHALL state that Define reads only the bag, never flattened snapshots.

#### Scenario: Pass-through definition entry

- **GIVEN** a reader consults the ubiquitous-language glossary
- **WHEN** they look up a Normal definition that transforms a same-named snapshot value
- **THEN** a **pass-through definition** entry SHALL define it as a Normal attribute definition whose expression reads its own name
- **AND** it SHALL state that Map seeds `attributeBag.current` from the same-named snapshot key and Define transforms that bag value
- **AND** it SHALL NOT use "identity mapping" or "copy definition" as a synonym

---

## MODIFIED Requirements

### Requirement: Glossary defines vanished snapshot key and definition-owned name

The ubiquitous-language glossary SHALL define **vanished snapshot key** and **definition-owned name** as Map-step terms. A **definition-owned name** SHALL be an attribute name configured as a `normalAttributeDefinitions` or `uniqueAttributeDefinitions` entry name, with Map behavior split by definition kind: a Normal definition name is merged as an implicit candidate when a live snapshot carries it and is never cleared; a Unique definition name is neither merged nor cleared as an implicit candidate. An explicit attribute mapping row SHALL still apply. Documentation SHALL NOT describe implicit Map as overwrite-only, and SHALL NOT use "orphaned attribute" or "stale attribute" for a vanished snapshot key, because **Orphan** already denotes a Fusion account with no contributing managed source accounts.

#### Scenario: Vanished snapshot key entry

- **GIVEN** a reader consults the ubiquitous-language glossary
- **WHEN** they look up names Map removes on refresh
- **THEN** a **vanished snapshot key** entry SHALL define it as an attribute name present in `attributeBag.current` that no live snapshot in the current `mapAttributes` invocation carries, that is not an `attributeMaps[].newAttribute` target, and that is not a definition-owned name or a denylisted control or overlay key
- **AND** it SHALL state that such a key is deleted from `attributeBag.current`
- **AND** it SHALL NOT use "orphaned attribute" or "stale attribute" as a synonym

#### Scenario: Definition-owned name entry

- **GIVEN** a reader consults the glossary
- **WHEN** they look up how Map treats names owned by Define
- **THEN** a **definition-owned name** entry SHALL define it as an attribute name configured as a `normalAttributeDefinitions` or `uniqueAttributeDefinitions` entry name
- **AND** it SHALL state that a Normal definition name is merged as an implicit candidate when a live snapshot carries it and is never cleared
- **AND** it SHALL state that a Unique definition name is neither merged nor cleared as an implicit candidate
- **AND** it SHALL state that an explicit attribute mapping row still applies

---

## REMOVED Requirements

_(none)_
