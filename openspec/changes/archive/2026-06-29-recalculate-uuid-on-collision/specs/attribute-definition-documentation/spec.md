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

#### Scenario: UUID expressions skip auto-append and resolve collisions by recalculation
- **GIVEN** any documentation surface describes the auto-append behavior
- **WHEN** a user reads it
- **THEN** it explains that expressions containing `$UUID` do NOT have `$counter` auto-appended
- **AND** it notes that when collisions occur for such expressions, a new UUID is generated instead of relying on a counter
