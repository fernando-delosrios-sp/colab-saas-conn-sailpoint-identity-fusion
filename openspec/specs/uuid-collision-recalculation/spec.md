## ADDED Requirements

### Requirement: UUID recalculation on collision

When a unique attribute definition generates a value using `$UUID` that collides with an existing value, the connector SHALL recalculate a new UUID rather than appending a counter, provided the expression includes `$UUID`.

#### Scenario: Pure UUID expression recalculates on collision
- **GIVEN** a unique attribute definition with expression `$UUID`
- **WHEN** a collision occurs during evaluation
- **THEN** the connector generates a completely new UUID on the next attempt
- **AND** no counter is appended to the value

#### Scenario: UUID expression with other text recalculates on collision
- **GIVEN** a unique attribute definition with expression `${firstname}-${UUID}`
- **WHEN** a collision occurs during evaluation
- **THEN** the connector generates a new UUID on the next attempt
- **AND** no counter is appended to the value

#### Scenario: Explicit counter mixed with UUID increments counter and recalculates UUID
- **GIVEN** a unique attribute definition with expression `${UUID}-${counter}`
- **WHEN** a collision occurs during evaluation
- **THEN** the connector generates a new UUID AND increments the counter on the next attempt
