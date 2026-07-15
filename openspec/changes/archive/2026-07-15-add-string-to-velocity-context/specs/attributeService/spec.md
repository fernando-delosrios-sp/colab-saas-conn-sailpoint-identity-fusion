## ADDED Requirements

### Requirement: Velocity context MUST expose the String object
The Velocity context helpers MUST include the Javascript `String` object, exposed as `String`, so that templates can access static string methods and perform string casting natively.

#### Scenario: Casting a numeric value to string
- **WHEN** a Velocity template evaluates `$String(123)`
- **THEN** it returns the string `"123"`

#### Scenario: Using static string methods
- **WHEN** a Velocity template evaluates `$String.fromCharCode(65)`
- **THEN** it returns the string `"A"`
