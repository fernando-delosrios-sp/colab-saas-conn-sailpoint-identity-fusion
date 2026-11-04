# definition-service Spec

## ADDED Requirements

### Requirement: Per base value counter is off unless the incremental counter is on

DefinitionService SHALL treat `counterPerBase` as off when the field is omitted. DefinitionService SHALL apply per-base counting only when both `useIncrementalCounter` and `counterPerBase` are true. When `useIncrementalCounter` is false, a true `counterPerBase` SHALL NOT change collision-based disambiguation and SHALL NOT persist a per-base counter.

#### Scenario: Omitted option uses one attribute counter

- **GIVEN** an incremental Unique definition that omits `counterPerBase`
- **WHEN** refreshUniqueAttributes generates a new value
- **THEN** the definition SHALL use one persistent counter for the attribute

#### Scenario: Option is ignored when the incremental counter is off

- **GIVEN** a Unique definition with `useIncrementalCounter` false and `counterPerBase` true
- **AND** the expression generates a value that is already registered
- **WHEN** refreshUniqueAttributes generates a new value
- **THEN** collision-based disambiguation SHALL run
- **AND** no per-base counter SHALL be persisted

### Requirement: Per base value counter keeps an independent sequence per base value

When per-base counting applies, DefinitionService SHALL derive one base value per generation, persist the last issued number for that base value, and start a missing base at the definition's counter start. The first issued number for a base SHALL be the counter start value. Different base values SHALL NOT share a sequence.

#### Scenario: Consecutive bases keep their own numbers

- **GIVEN** per-base counting is on and the counter start value is 1
- **AND** the expression appends `$counter` to the base value
- **WHEN** refreshUniqueAttributes generates values whose base values are `ab`, `ab`, `bb`, and `ab`
- **THEN** the generated values SHALL be `ab1`, `ab2`, `bb1`, and `ab3`

#### Scenario: A conditional may omit the counter when it is zero

- **GIVEN** per-base counting is on and the counter start value is 0
- **AND** the expression omits `$counter` when `$counter` equals 0 and prints `$counter` otherwise
- **WHEN** the first value for base `ab` is generated
- **THEN** the generated value SHALL be `ab`

#### Scenario: The next number for that base is printed

- **GIVEN** the first value for base `ab` was `ab` because the counter was 0
- **WHEN** the next value for base `ab` is generated
- **THEN** the generated value SHALL be `ab1`

#### Scenario: A kept value does not seed the per-base counter

- **GIVEN** per-base counting is on and the counter start value is 1
- **AND** `ab7` is already registered for the attribute
- **AND** no counter is saved for base `ab`
- **WHEN** a new value is generated for base `ab`
- **THEN** the generated value SHALL be `ab1`

### Requirement: Incremental expressions must reference the counter

During counter initialization, DefinitionService SHALL fail the operation when an incremental Unique definition's expression does not reference `$counter`, `${counter}`, `$!counter`, or `$!{counter}`. The operation SHALL fail before any unique value is generated. A `$UUID` reference SHALL NOT satisfy the check.

#### Scenario: Missing counter reference fails at initialization

- **GIVEN** an incremental Unique definition whose expression does not reference `$counter`
- **WHEN** counters are initialized
- **THEN** the operation SHALL fail before any unique value is generated
- **AND** the error SHALL name the attribute
- **AND** the error SHALL state that the expression does not reference `$counter`

#### Scenario: Formal and quiet counter references are accepted

- **GIVEN** an incremental Unique definition whose expression references `${counter}`, `$!counter`, or `$!{counter}`
- **WHEN** counters are initialized
- **THEN** initialization SHALL NOT fail for a missing counter reference

### Requirement: Per base value counter fails when the rendered value is already registered

When per-base counting applies, DefinitionService SHALL fail the operation if the rendered value is already in the attribute's unique registry or in the customizer store for that attribute. It SHALL NOT issue another number for that account. The error SHALL name the attribute and the rendered value, and it SHALL mention an expression that hides `$counter`, lost or reset Fusion state, a managed-source or customizer value, and truncation.

#### Scenario: Registered per-base value fails the operation

- **GIVEN** per-base counting is on
- **AND** the rendered value is already registered for the attribute
- **WHEN** refreshUniqueAttributes generates a value for that base
- **THEN** the operation SHALL fail
- **AND** no further counter value SHALL be tried for that account
- **AND** the error SHALL name the attribute and the rendered value
- **AND** the error SHALL mention an expression that hides `$counter`, lost or reset Fusion state, a managed-source or customizer value, and truncation

### Requirement: Per base value counter cuts the base to reserve counter width

When per-base counting applies, the base value SHALL be the empty-counter render after trim, case, spaces, and normalize. When a maximum length is set, that render SHALL be cut to `maxLength - digits` characters, and base values that share the cut SHALL share one counter. When no maximum length is set, the base value SHALL keep the full render and the counter MAY grow past the minimum digits.

#### Scenario: Bases that differ past the reserved width share a counter

- **GIVEN** per-base counting is on, the maximum length is 4, and the minimum digits is 1
- **AND** two empty-counter renders are `abcd` and `abce`
- **WHEN** values are generated for those renders
- **THEN** the generated values SHALL be `abc1` and `abc2`

### Requirement: Per base value counter fails when the counter does not fit

When per-base counting applies and a maximum length is set, DefinitionService SHALL fail the operation if the next number needs more characters than the minimum digits, or if the maximum length is less than or equal to the minimum digits. The error SHALL name **Minimum counter digits**.

#### Scenario: A counter wider than the reserved digits fails

- **GIVEN** per-base counting is on, a maximum length is set, and the minimum digits is 1
- **AND** the next number for the base is 10
- **WHEN** a value is generated for that base
- **THEN** the operation SHALL fail
- **AND** the error SHALL name **Minimum counter digits**
- **AND** the attempt SHALL NOT be registered

#### Scenario: A maximum length that cannot hold the counter fails at initialization

- **GIVEN** per-base counting is on
- **AND** the maximum length is less than or equal to the minimum digits
- **WHEN** counters are initialized
- **THEN** the operation SHALL fail
- **AND** the error SHALL name **Minimum counter digits**

---

## MODIFIED Requirements

### Requirement: DefinitionService generates unique attribute values with collision handling

DefinitionService SHALL generate unique attribute values for Unique attribute definitions, using the configured uniqueness strategy (UUID, incremental counter, per-base incremental counter, or collision-based disambiguation with $counter). An incremental definition with `counterPerBase` off SHALL keep one persistent counter for the attribute and SHALL raise that counter from the trailing digits of a kept value when that number is higher. An incremental definition SHALL NOT append `$counter` itself. Collision-based disambiguation SHALL still append `$counter` when the expression does not already reference `$counter` or `$UUID`.

#### Scenario: UUID-based unique attribute generated

- **GIVEN** a Unique definition with expression containing $UUID
- **WHEN** refreshUniqueAttributes evaluates the definition
- **THEN** a v4 UUID SHALL be generated and injected into the context as $UUID
- **AND** if the generated value collides, a new UUID SHALL be generated

#### Scenario: Collision-based unique attribute with $counter

- **GIVEN** a Unique definition with expression that generates a colliding value
- **WHEN** refreshUniqueAttributes evaluates the definition
- **THEN** $counter SHALL be appended and incremented until a unique value is found
- **AND** $counter on the first attempt SHALL be the empty string

#### Scenario: Incremental counter unique attribute

- **GIVEN** a Unique definition with useIncrementalCounter enabled and counterPerBase off
- **WHEN** refreshUniqueAttributes evaluates the definition for an account that needs a new value
- **THEN** the persistent attribute counter SHALL increment on each evaluation
- **AND** the generated value SHALL incorporate the incremented counter

#### Scenario: Kept value raises the single attribute counter

- **GIVEN** an incremental Unique definition with counterPerBase off
- **AND** an account keeps a value whose trailing number is higher than the saved attribute counter
- **WHEN** that account is reprocessed and keeps the value
- **THEN** the next new value for the attribute SHALL use a number higher than that trailing number

### Requirement: DefinitionService manages counter state

DefinitionService SHALL persist counter state across operation runs via StateWrapper, using LockService for thread-safe increments in parallel processing. An incremental definition with counterPerBase off SHALL persist one number for the attribute. An incremental definition with counterPerBase on SHALL persist one number per base value, keyed by the readable base value. Increments for different base values SHALL NOT block each other. When the saved value for an attribute is a number while per-base counting is on, or a map of base values while per-base counting is off, DefinitionService SHALL fail the operation during counter initialization. The error SHALL name the attribute and SHALL tell the admin to switch **Per base value counter?** back or reset Fusion state.

#### Scenario: Persistent counter increments safely

- **WHEN** two concurrent operations increment the same counter
- **THEN** each SHALL receive a unique increment value
- **AND** no values SHALL be skipped or duplicated

#### Scenario: Different base values do not share a lock

- **GIVEN** per-base counting is on
- **WHEN** two accounts with different base values are generated concurrently
- **THEN** each base SHALL receive the next number from its own counter

#### Scenario: A saved number is rejected when per-base counting is on

- **GIVEN** per-base counting is on
- **AND** the saved counter state for the attribute is a single number
- **WHEN** counters are initialized
- **THEN** the operation SHALL fail
- **AND** the error SHALL name the attribute
- **AND** the error SHALL tell the admin to switch **Per base value counter?** back or reset Fusion state

#### Scenario: A saved base map is rejected when per-base counting is off

- **GIVEN** per-base counting is off
- **AND** the saved counter state for the attribute is a map of base values
- **WHEN** counters are initialized
- **THEN** the operation SHALL fail
- **AND** the error SHALL name the attribute
- **AND** the error SHALL tell the admin to switch **Per base value counter?** back or reset Fusion state
