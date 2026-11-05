## MODIFIED Requirements

### Requirement: DefinitionService manages unique value registries

DefinitionService SHALL maintain per-attribute sets of registered unique values to prevent collisions. It SHALL provide register and unregister operations for lifecycle management. A candidate SHALL be unique when it is absent from the registered set for that attribute. DefinitionService SHALL NOT consult a pre-compiled customizer value index.

#### Scenario: Unique values registered after generation
- **WHEN** a unique attribute value is successfully generated
- **THEN** the value SHALL be added to the registered set for that attribute

#### Scenario: Unique values unregistered on account removal
- **WHEN** unregisterUniqueAttributes is called for a FusionAccount
- **THEN** all unique values owned by that account SHALL be removed from registered sets

#### Scenario: Candidate collides with a registered Internal Record value
- **GIVEN** record registration has stored `jdoe` for attribute `sAMAccountName`
- **WHEN** DefinitionService evaluates whether candidate `jdoe` is unique for `sAMAccountName`
- **THEN** it SHALL report the candidate as not unique

### Requirement: Per base value counter fails when the rendered value is already registered

When per-base counting applies, DefinitionService SHALL fail the operation if the rendered value is already in the attribute's unique registry. It SHALL NOT issue another number for that account. The error SHALL name the attribute and the rendered value, and it SHALL mention an expression that hides `$counter`, lost or reset Fusion state, a managed-source or Internal Record value, and truncation.

#### Scenario: Registered per-base value fails the operation
- **GIVEN** per-base counting is on
- **AND** the rendered value is already registered for the attribute
- **WHEN** refreshUniqueAttributes generates a value for that base
- **THEN** the operation SHALL fail
- **AND** no further counter value SHALL be tried for that account
- **AND** the error SHALL name the attribute and the rendered value
- **AND** the error SHALL mention an expression that hides `$counter`, lost or reset Fusion state, a managed-source or Internal Record value, and truncation

## REMOVED Requirements

### Requirement: DefinitionService logs customizer unique index loading metrics

**Reason**: The Customizer Value Store and its `.bin` indexes are retired.

**Migration**: Do not initialize or log a customizer unique index. Unique collisions are reported from the registered-value set.
