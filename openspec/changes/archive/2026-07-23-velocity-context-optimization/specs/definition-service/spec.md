## ADDED Requirements

### Requirement: Velocity render context uses null prototype and merged helpers

`evaluateVelocityTemplate` SHALL construct the Velocity render context as a single object with `Object.create(null)` as its prototype. The context MUST merge caller-supplied `context` properties and exported `contextHelpers` such that helper keys override context keys on collision. All exported helpers (including Normalize, Math, Datefns, JSON, and AddressParse) MUST remain accessible in template expressions after construction.

#### Scenario: Helpers accessible in template evaluation
- **GIVEN** a Velocity expression referencing `$Normalize.name($lastName)` and a context with `lastName: "Smith"`
- **WHEN** `evaluateVelocityTemplate` evaluates the expression
- **THEN** the Normalize helper SHALL be callable
- **AND** the rendered result SHALL match pre-optimization behavior

#### Scenario: Render context has null prototype
- **GIVEN** any Velocity template evaluation
- **WHEN** the render context is constructed
- **THEN** `Object.getPrototypeOf(renderContext)` SHALL be `null`
- **AND** prototype-pollution vectors such as `$constructor` MUST NOT resolve via `Object.prototype`

#### Scenario: Helper keys override context keys on collision
- **GIVEN** a context property and a contextHelper share the same key name
- **WHEN** the render context is constructed
- **THEN** the contextHelper value SHALL take precedence over the context property value
