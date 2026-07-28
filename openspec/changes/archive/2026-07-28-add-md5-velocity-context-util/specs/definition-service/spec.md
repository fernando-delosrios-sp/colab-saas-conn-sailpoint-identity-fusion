## ADDED Requirements

### Requirement: MD5 helper computes lowercase hex digests

The Velocity context helper `MD5` SHALL be a callable function that returns the MD5 digest of the input string as a 32-character lowercase hexadecimal string. The implementation MUST use Node.js native `crypto.createHash('md5')`.

#### Scenario: Known input produces expected digest
- **GIVEN** a Velocity expression `$MD5($email)` and context `{ email: "user@example.com" }`
- **WHEN** `evaluateVelocityTemplate` evaluates the expression
- **THEN** the rendered result SHALL equal the lowercase hex MD5 digest of `"user@example.com"`

#### Scenario: Empty or invalid input returns empty string
- **GIVEN** a Velocity expression `$MD5($missing)` and context with no `missing` key or with `missing` set to null, undefined, a non-string, or whitespace-only text
- **WHEN** `evaluateVelocityTemplate` evaluates the expression
- **THEN** the rendered result SHALL be an empty string

---

## MODIFIED Requirements

### Requirement: Velocity render context uses null prototype and merged helpers

`evaluateVelocityTemplate` SHALL construct the Velocity render context as a single object with `Object.create(null)` as its prototype. The context MUST merge caller-supplied `context` properties and exported `contextHelpers` such that helper keys override context keys on collision. All exported helpers (including Normalize, Math, Datefns, JSON, AddressParse, and MD5) MUST remain accessible in template expressions after construction.

#### Scenario: Helpers accessible in template evaluation
- **GIVEN** a Velocity expression referencing `$Normalize.name($lastName)` and a context with `lastName: "Smith"`
- **WHEN** `evaluateVelocityTemplate` evaluates the expression
- **THEN** the Normalize helper SHALL be callable
- **AND** the rendered result SHALL match pre-optimization behavior

#### Scenario: MD5 helper accessible in template evaluation
- **GIVEN** a Velocity expression referencing `$MD5($value)` and a context with `value: "test"`
- **WHEN** `evaluateVelocityTemplate` evaluates the expression
- **THEN** the MD5 helper SHALL be callable
- **AND** the rendered result SHALL be a 32-character lowercase hex string

#### Scenario: Render context has null prototype
- **GIVEN** any Velocity template evaluation
- **WHEN** the render context is constructed
- **THEN** `Object.getPrototypeOf(renderContext)` SHALL be `null`
- **AND** prototype-pollution vectors such as `$constructor` MUST NOT resolve via `Object.prototype`

#### Scenario: Helper keys override context keys on collision
- **GIVEN** a context property and a contextHelper share the same key name
- **WHEN** the render context is constructed
- **THEN** the contextHelper value SHALL take precedence over the context property value
