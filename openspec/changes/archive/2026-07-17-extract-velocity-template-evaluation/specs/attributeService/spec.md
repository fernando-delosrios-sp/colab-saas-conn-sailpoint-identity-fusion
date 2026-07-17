## ADDED Requirements

### Requirement: Unresolved Velocity variables render literally

When evaluating a Velocity expression, the attribute service SHALL apply standard Velocity semantics: an unresolved variable referenced as `$var` SHALL render literally as `$var`, and an unresolved variable referenced as `$!var` SHALL render as an empty string.

#### Scenario: Unresolved variable renders literally
- **WHEN** the attribute service evaluates a Normal expression `"$missing"`
- **AND** `$missing` is not present in the Velocity context
- **THEN** the evaluated value is `"$missing"`

#### Scenario: Quiet unresolved variable renders empty
- **WHEN** the attribute service evaluates a Normal expression `"$!missing"`
- **AND** `$missing` is not present in the Velocity context
- **THEN** the evaluated value is `""`

### Requirement: Template evaluation returns a structured result

`evaluateAttributeTemplate` SHALL accept an attribute definition, a Velocity context, and an options object and SHALL return `{ value, error? }`, where `value` is the rendered Velocity output and `error` is present only when evaluation fails.

#### Scenario: Normal expression renders successfully
- **WHEN** `evaluateAttributeTemplate` is called with a Normal definition whose expression is `"$firstname.$lastname"`
- **AND** the context contains `firstname: "ada"` and `lastname: "wong"`
- **THEN** the returned `value` is `"ada.wong"`
- **AND** the returned `error` is undefined

#### Scenario: Missing expression returns an error result
- **WHEN** `evaluateAttributeTemplate` is called with a definition that has no expression
- **THEN** the returned `value` is undefined
- **AND** the returned `error` is a non-empty string describing the failure

### Requirement: Non-string Velocity results pass through unchanged

If the Velocity engine returns a non-string value (for example `undefined`, `null`, a number, or an object), `evaluateAttributeTemplate` SHALL return that value directly without coercing it to a string.

#### Scenario: Numeric Velocity result passes through
- **WHEN** `evaluateAttributeTemplate` evaluates an expression that resolves to the number `42`
- **THEN** the returned `value` is `42`

#### Scenario: Undefined Velocity result passes through
- **WHEN** `evaluateAttributeTemplate` evaluates an expression that resolves to `undefined`
- **THEN** the returned `value` is `undefined`

### Requirement: Output transforms run in canonical order

`applyOutputTransforms` SHALL apply the transform pipeline `trim` → `case` → `spaces` → `normalize` → counter-aware `maxLength` to the raw Velocity output, in that exact order, and return the transformed value.

#### Scenario: All transforms apply in order
- **WHEN** `applyOutputTransforms` is called with raw value `"  HELLO WORLD  "`
- **AND** the definition enables `trim: true`, `case: lower`, `spaces: true`, and `maxLength: 11`
- **THEN** trim produces `"HELLO WORLD"`
- **AND** case produces `"hello world"`
- **AND** spaces produces `"helloworld"`
- **AND** maxLength leaves `"helloworld"` unchanged

### Requirement: Counter length is reserved from the maxLength budget

When the Velocity context contains an active `$counter` value, `applyOutputTransforms` SHALL subtract the rendered counter width from `maxLength` before truncating the non-counter portion, so the final assembled value does not exceed `maxLength`.

#### Scenario: Counter fits within maxLength
- **WHEN** `applyOutputTransforms` is called with raw value `"johndoe"`
- **AND** the definition has `maxLength: 10`
- **AND** the context counter renders as `"01"` (2 chars)
- **THEN** the non-counter budget is `8` chars
- **AND** since `"johndoe"` is 7 chars, it is kept in full
- **AND** the returned value is `"johndoe01"`

#### Scenario: Prefix is truncated to fit counter within maxLength
- **WHEN** `applyOutputTransforms` is called with raw value `"johndoe"`
- **AND** the definition has `maxLength: 8`
- **AND** the context counter renders as `"01"` (2 chars)
- **THEN** the non-counter budget is `6` chars
- **AND** the prefix is truncated to `"johndo"`
- **AND** the returned value is `"johndo01"`

### Requirement: Unique candidate evaluation uses the same transform pipeline

When `$isUnique(value)` is evaluated, the candidate value SHALL be processed by the same `applyOutputTransforms` pipeline that the production Unique attribute path uses, so the comparison against the registered-in-use set is consistent.

#### Scenario: isUnique applies counter-aware maxLength to candidate
- **WHEN** `$isUnique("johndoe")` is evaluated for a Unique definition with `maxLength: 8`
- **AND** the active counter renders as `"01"`
- **THEN** `applyOutputTransforms` truncates the candidate to `"johndo"`
- **AND** the transformed candidate `"johndo"` is checked against the registered-in-use set

### Requirement: Output transforms pass through non-string values unchanged

If the raw input to `applyOutputTransforms` is not a string, the helper SHALL return it unchanged without applying any transforms.

#### Scenario: Numeric raw value passes through
- **WHEN** `applyOutputTransforms` is called with raw value `42`
- **THEN** the returned value is `42`

#### Scenario: Undefined raw value passes through
- **WHEN** `applyOutputTransforms` is called with raw value `undefined`
- **THEN** the returned value is `undefined`

## MODIFIED Requirements

*No existing requirements are modified in this change; the extraction and standard-velocity behavior are additive.

## REMOVED Requirements

*No existing requirements are removed in this change.

## RENAMED Requirements

*No existing requirements are renamed in this change.
