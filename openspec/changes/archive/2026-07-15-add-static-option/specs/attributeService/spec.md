## ADDED Requirements

### Requirement: Static attribute configuration

The configuration schema MUST expose a `static` boolean toggle for Normal Attribute Definitions. This toggle MUST be mutually exclusive with the `refresh` toggle in its behavior and documentation.

#### Scenario: Configuration indicates mutual exclusivity
- **WHEN** configuring a normal attribute
- **THEN** the UI documentation or `helpKey` MUST state that `static` behavior overrides or is mutually exclusive with `refresh`.

### Requirement: Static attributes skip evaluation if value exists

When evaluating normal attribute definitions, the service MUST check the `static` flag on the definition. If `static` is true and a valid value already exists for this attribute on the `FusionAccount`, the service MUST NOT re-evaluate the Velocity template, bypassing any `needsRefresh` state triggered by source data changes. The only exception is if the account explicitly requires a full reset (`needsReset` is true).

#### Scenario: Static attribute retains its value despite source data changes
- **WHEN** a normal attribute definition has `static: true`
- **AND** the attribute already has a valid string value
- **AND** new source data arrives causing `needsRefresh` to be true
- **THEN** the attribute template MUST NOT be re-evaluated
- **AND** the existing value MUST be preserved

#### Scenario: Static attribute is evaluated when missing
- **WHEN** a normal attribute definition has `static: true`
- **AND** the attribute does not currently have a valid value
- **THEN** the attribute template MUST be evaluated and the value saved

#### Scenario: Static attribute is evaluated on full reset
- **WHEN** a normal attribute definition has `static: true`
- **AND** the attribute already has a valid string value
- **AND** the account `needsReset` flag is true
- **THEN** the attribute template MUST be re-evaluated despite the static flag
