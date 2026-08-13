# velocity-helper-empty-fallback Delta Spec

## ADDED Requirements

### Requirement: Custom Velocity helpers return empty string on failure

All custom context helpers exported from `contextHelpers` (Normalize, Datefns, JSON, AddressParse, MD5) SHALL return an empty string when they cannot produce a valid result for the given input. Helpers MUST NOT return `undefined` or `null` to the Velocity renderer for failure cases, because `velocityjs` renders the literal template expression when the result is undefined.

Native globals `$Math` and `$String` are excluded — they follow JavaScript semantics and are not custom connector helpers.

#### Scenario: JSON.parse with invalid input yields no output
- **GIVEN** a Velocity expression `$JSON.parse("invalid")` or `$JSON.parse($missing)` with no `missing` key
- **WHEN** `evaluateVelocityTemplate` evaluates the expression
- **THEN** the rendered result SHALL be an empty string
- **AND** `evaluateVelocityTemplate` SHALL return `undefined`

#### Scenario: AddressParse city lookup with missing input yields no output
- **GIVEN** a Velocity expression `$AddressParse.getCityState($city)` and context with no `city` key or with `city` set to null
- **WHEN** `evaluateVelocityTemplate` evaluates the expression
- **THEN** the rendered result SHALL be an empty string
- **AND** `evaluateVelocityTemplate` SHALL return `undefined`

#### Scenario: AddressParse.parse with unparseable input yields no output
- **GIVEN** a Velocity expression `$AddressParse.parse($address)` and context with no `address` key or with an unparseable address
- **WHEN** `evaluateVelocityTemplate` evaluates the expression
- **THEN** the rendered result SHALL be an empty string
- **AND** `evaluateVelocityTemplate` SHALL return `undefined`

#### Scenario: Nested Datefns chain with missing input yields no output
- **GIVEN** a Velocity expression `$Datefns.format($Datefns.parse($INACTIVE_DATE, "yyyy-MM-dd"))` and context with no `INACTIVE_DATE` key or with `INACTIVE_DATE` set to null
- **WHEN** `evaluateVelocityTemplate` evaluates the expression
- **THEN** the rendered result SHALL be an empty string
- **AND** `evaluateVelocityTemplate` SHALL return `undefined`

#### Scenario: Successful helper calls unchanged
- **GIVEN** a Velocity expression with valid inputs for any custom helper
- **WHEN** `evaluateVelocityTemplate` evaluates the expression
- **THEN** the rendered result SHALL match pre-change behavior for that helper

### Requirement: Shared Velocity helper fallback utility

The definition service SHALL provide a shared `withVelocityHelperFallback` wrapper used by all custom context helper exports that can fail. The wrapper SHALL log debug messages when the inner function returns `undefined` or `null`, log errors on thrown exceptions, and return an empty string in both cases.

#### Scenario: Wrapper converts undefined to empty string
- **GIVEN** a helper function that returns `undefined` for invalid input
- **WHEN** the function is exported through `withVelocityHelperFallback`
- **THEN** the wrapped export SHALL return an empty string for that input

#### Scenario: Wrapper converts null to empty string
- **GIVEN** a helper function that returns `null` for invalid input
- **WHEN** the function is exported through `withVelocityHelperFallback`
- **THEN** the wrapped export SHALL return an empty string for that input
