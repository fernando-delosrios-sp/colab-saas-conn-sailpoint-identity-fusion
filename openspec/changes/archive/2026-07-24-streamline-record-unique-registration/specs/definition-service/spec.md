## ADDED Requirements

### Requirement: DefinitionService exposes UniqueRegistrationPlan

DefinitionService SHALL precompute a `UniqueRegistrationPlan` at construction from `uniqueAttributeDefinitions` and `attributeMaps`. The plan SHALL contain: (1) `uniqueNames` — all unique definition names; (2) `mapTargets` — names in both unique definitions and attribute map `newAttribute` values; (3) `passthroughNames` — unique names not in `mapTargets` (values read from source attributes after hydration when the source attribute name matches).

#### Scenario: Plan intersects maps with unique definitions

- **GIVEN** unique definitions for `employeeId` and `email`
- **AND** attribute maps targeting `employeeId` but not `email`
- **WHEN** DefinitionService builds the registration plan
- **THEN** `mapTargets` SHALL contain `employeeId` only
- **AND** `passthroughNames` SHALL contain `email`

### Requirement: DefinitionService registers unique values from record managed accounts

DefinitionService SHALL expose a method to register unique attribute values from a managed source account using the registration plan: hydrate a minimal FusionAccount, apply selective mapping for `mapTargets` only, then call `registerUniqueAttributes`. Normal attribute definitions and unique-definition Velocity evaluation SHALL NOT run on this path.

#### Scenario: Mapped unique value registered

- **GIVEN** a managed account whose source attribute maps to unique definition name `employeeId`
- **WHEN** record unique registration runs for that account
- **THEN** the mapped value SHALL be added to the unique value registry for `employeeId`

#### Scenario: Passthrough unique value registered

- **GIVEN** a managed account with source attribute `email` matching a unique definition name `email`
- **AND** `email` is not in `mapTargets`
- **WHEN** record unique registration runs
- **THEN** the source attribute value SHALL be registered for `email`

#### Scenario: Missing value skipped without error

- **GIVEN** a managed account with no value for a unique definition name
- **WHEN** record unique registration runs
- **THEN** registration SHALL skip that attribute
- **AND** processing SHALL continue for remaining unique names
