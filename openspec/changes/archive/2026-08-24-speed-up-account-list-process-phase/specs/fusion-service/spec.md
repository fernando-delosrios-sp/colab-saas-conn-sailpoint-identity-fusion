## ADDED Requirements

### Requirement: Unique JIT on Output does not hold the unique registry lock during Velocity evaluation

`FusionService.forEachISCAccount` SHALL continue to call `refreshUniqueAttributes` immediately before `getISCAccount` for accounts with `needsRefresh` when unique refresh is enabled. Unique template evaluation SHALL follow `definition-service` (registry lock does not cover Velocity). This requirement does not allow calling `listISCAccounts` on the account-list output path, eager Unique generation during Process, or skipping in-memory counter advance during dry-run Output.

#### Scenario: JIT Unique generation still precedes serialize

- **GIVEN** a Fusion account that requires Unique attribute generation
- **WHEN** Output iterates that account via `forEachISCAccount` with unique refresh enabled
- **THEN** Unique attributes SHALL be generated immediately before serialization
- **AND** the serialized account SHALL then be removed from memory as today

#### Scenario: Dry-run Output still uses in-memory counters

- **GIVEN** account-list dry-run with Unique incremental counters
- **WHEN** Output refreshes Unique attributes
- **THEN** in-memory counters MAY advance to project unique values
- **AND** counter persistence to the ISC tenant SHALL NOT occur
