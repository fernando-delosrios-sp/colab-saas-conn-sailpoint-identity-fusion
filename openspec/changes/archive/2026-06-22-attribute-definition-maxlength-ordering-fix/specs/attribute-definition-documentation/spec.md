## ADDED Requirements

### Requirement: maxLength is applied after all other output transforms

`maxLength` MUST be the final output transform applied to an attribute definition's generated value. The complete canonical pipeline is: Velocity render → `trim` → `case` → `spaces` → `normalize` → `maxLength` truncation. No step after `maxLength` may add or remove characters.

Feature: Attribute definition output transforms
Rule: maxLength truncation MUST run after trim, case, spaces, and normalize so the final value length is exactly ≤ maxLength.

#### Scenario: trim runs before maxLength so the final value is not shorter than intended
- **GIVEN** an attribute definition with `maxLength: 10` and `trim: true`
- **AND** the Velocity expression renders to `"  hello world  "` (15 chars including spaces)
- **WHEN** the output transforms are applied
- **THEN** trim produces `"hello world"` (11 chars)
- **AND** maxLength truncates to `"hello worl"` (exactly 10 chars)
- **AND** the stored value is `"hello worl"`, not a shorter whitespace-free string

#### Scenario: case transform runs before maxLength
- **GIVEN** an attribute definition with `maxLength: 5` and `case: lower`
- **AND** the Velocity expression renders to `"ABCDEF"` (6 chars)
- **WHEN** the output transforms are applied
- **THEN** case produces `"abcdef"` (6 chars)
- **AND** maxLength truncates to `"abcde"` (exactly 5 chars)

#### Scenario: normalize runs before maxLength
- **GIVEN** an attribute definition with `maxLength: 5` and `normalize: true`
- **AND** the Velocity expression renders to `"café́s"` (which normalizes/transliterates to a longer ASCII string)
- **WHEN** the output transforms are applied
- **THEN** normalize runs first
- **AND** maxLength truncates the normalized result to 5 chars

#### Scenario: no transforms leaves maxLength as sole truncation
- **GIVEN** an attribute definition with `maxLength: 8` and no other transforms enabled
- **AND** the Velocity expression renders to `"abcdefghij"` (10 chars)
- **WHEN** the output transforms are applied
- **THEN** the stored value is `"abcdefgh"` (exactly 8 chars)

### Requirement: Counter length is reserved from the maxLength budget before truncation

When a `$counter` value is active in the Velocity context for a Unique attribute definition, the counter's rendered character width MUST be subtracted from the `maxLength` budget before the non-counter portion of the string is truncated, so that the final assembled value (prefix + counter + suffix) does not exceed `maxLength`.

Feature: Attribute definition output transforms
Rule: For Unique definitions with maxLength and an active counter, the counter occupies part of the maxLength budget.

#### Scenario: counter length is reserved so assembled value fits in maxLength
- **GIVEN** a Unique attribute definition with `maxLength: 10`
- **AND** `$counter` resolves to `"01"` (2 chars)
- **AND** the expression prefix before counter renders to `"johndoe"` (7 chars) after post-processing
- **WHEN** maxLength truncation is applied with counter reservation
- **THEN** available budget for the non-counter portion is `10 - 2 = 8` chars
- **AND** since `7 ≤ 8`, the prefix is kept in full
- **AND** the final value is `"johndoe01"` (9 chars ≤ 10)

#### Scenario: prefix is trimmed when prefix + counter exceeds maxLength
- **GIVEN** a Unique attribute definition with `maxLength: 8`
- **AND** `$counter` resolves to `"01"` (2 chars)
- **AND** the expression renders to `"johndoe01"` (9 chars) with prefix `"johndoe"` (7 chars)
- **WHEN** maxLength truncation is applied with counter reservation
- **THEN** available budget for prefix is `8 - 2 = 6` chars
- **AND** the prefix is truncated to `"johndo"` (6 chars)
- **AND** the final value is `"johndo01"` (exactly 8 chars)

#### Scenario: isUnique helper applies same counter-aware truncation as production path
- **GIVEN** a Unique attribute definition with `maxLength: 8` and an active counter of `"01"`
- **WHEN** the `$isUnique(value)` helper evaluates a candidate value
- **THEN** it applies the same trim → case → spaces → normalize → counter-aware maxLength pipeline
- **AND** the transformed candidate it checks against the registered-in-use set matches the value that the production path would store

## MODIFIED Requirements

### Requirement: $counter auto-append rules are documented accurately

The connector auto-appends `$counter` to unique-attribute expressions that do not include `$counter` or `$UUID`, with one important exception. These rules MUST be described accurately in all documentation surfaces.

Feature: Fusion account attribute resolution
Rule: The connector auto-appends $counter to unique-attribute expressions that do not include $counter or $UUID.

#### Scenario: Velocity-directive skip is documented
- **GIVEN** any documentation surface describes the `$counter` auto-append behavior
- **WHEN** a user reads it
- **THEN** it explains that the auto-append is skipped when the expression contains Velocity directives (`#if`, `#set`, `#else`, `#end`, etc.) because appending after `#end` would break parsing
- **AND** it explains the workaround: include `$counter` explicitly in expressions that use directives

#### Scenario: Empty first try is documented
- **GIVEN** any documentation surface describes the `$counter` variable in collision mode
- **WHEN** a user reads it
- **THEN** it explains that `$counter` renders as the empty string on the first try and as the padded counter (zero-padded per `Minimum counter digits`) on subsequent attempts

#### Scenario: maxLength reserves space for counter so total does not exceed limit
- **GIVEN** any documentation surface describes `maxLength` in the context of Unique attribute definitions
- **WHEN** a user reads it
- **THEN** it explains that when `$counter` is active, its character length is reserved from the `maxLength` budget so the final value (prefix + counter + suffix) does not exceed `maxLength`
- **AND** it notes that this means the non-counter portion of the value may be shorter than `maxLength` to accommodate the counter

## REMOVED Requirements

<!-- none -->
