## ADDED Requirements

### Requirement: DefinitionService Velocity caller context does not clone the current bag

`buildVelocityContext` SHALL expose current Fusion account attributes to templates without shallow-copying `attributeBag.current` into a new object that holds those attributes as own properties. Special keys (`identity`, `accounts`, `previous`, `sources`, `account`, `originSource`, `originAccount`) SHALL remain own properties on the context object so they override any same-named current attributes, matching pre-change spread-then-assign behavior. Sequential Normal definition writes SHALL still update `fusionAccount.attributes` and the evaluation context for later definitions.

#### Scenario: Later Normal definition sees an earlier write

- **GIVEN** Normal definitions `first` then `full` where `full`’s expression is `"$first"`
- **AND** `first` evaluates to `"Ada"`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** `full` SHALL be `"Ada"`

#### Scenario: Special context keys override current bag names

- **GIVEN** `attributeBag.current.identity` is the string `"not-the-identity-object"`
- **AND** the Fusion account has an identity bag with `name` `"Jane"`
- **AND** a Normal definition expression `"$identity.name"`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the defined attribute SHALL be `"Jane"`

#### Scenario: Render context remains null-prototype at evaluateVelocityTemplate

- **GIVEN** any Normal definition evaluation
- **WHEN** `evaluateVelocityTemplate` builds the render context
- **THEN** `Object.getPrototypeOf(renderContext)` SHALL still be `null`
- **AND** helper keys SHALL still override caller context keys

### Requirement: Normal definition evaluation is synchronous per definition

`processNormalDefinition` SHALL NOT return a Promise. `refreshNormalAttributes` MAY remain async for its public signature but SHALL NOT await a Promise per Normal definition that only performs synchronous Velocity evaluation.

#### Scenario: Falsy evaluation still clears

- **GIVEN** an existing Fusion account with attribute `formattedDate` `"2024-01-15"`
- **AND** a Normal definition for `formattedDate` whose expression evaluates to empty
- **WHEN** `refreshNormalAttributes` processes the definition
- **THEN** `formattedDate` MUST be removed from `fusionAccount.attributes`

### Requirement: evaluateVelocityTemplate does not debug-log every render

`evaluateVelocityTemplate` SHALL NOT call the connector-sdk `logger.debug` for the expression, cache miss, or result on the evaluation path. Template compile caching and null-prototype helper merge SHALL remain.

#### Scenario: Template still renders without debug logging

- **GIVEN** expression `"$firstName"` and context `{ firstName: "John" }`
- **WHEN** `evaluateVelocityTemplate` runs
- **THEN** the result SHALL be `"John"`
- **AND** the call SHALL NOT require debug logging to be enabled
