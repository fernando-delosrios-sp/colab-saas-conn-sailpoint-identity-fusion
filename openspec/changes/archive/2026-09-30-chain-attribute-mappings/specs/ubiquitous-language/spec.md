## ADDED Requirements

### Requirement: Glossary defines prior mapped value

The ubiquitous-language glossary SHALL define **prior mapped value** as a Map-step term: the value an earlier explicit attribute map wrote during the same Map invocation, addressed by that map's new attribute name. It SHALL state that a later explicit attribute map can read that value, and that a map cannot read an explicit attribute map listed after it. Documentation and connector help text SHALL NOT call this a mapping chain, a chained mapping, or a derived attribute. The term SHALL NOT reuse **chain**, which remains reserved for recordings. A prior mapped value SHALL NOT be described as a live snapshot attribute, a **definition-owned name**, or a **pass-through definition**.

#### Scenario: Prior mapped value entry

- **GIVEN** a reader consults the ubiquitous-language glossary
- **WHEN** they look up the value a later explicit attribute map reads from an earlier one
- **THEN** a **prior mapped value** entry SHALL define it as the value an earlier explicit attribute map wrote during the same Map invocation, addressed by that map's new attribute name
- **AND** it SHALL state that a later explicit attribute map can read it
- **AND** it SHALL state that a map cannot read an explicit attribute map listed after it
- **AND** it SHALL NOT use "mapping chain", "chained mapping", or "derived attribute" as a synonym

---

## MODIFIED Requirements

---

## REMOVED Requirements

---

## RENAMED Requirements
