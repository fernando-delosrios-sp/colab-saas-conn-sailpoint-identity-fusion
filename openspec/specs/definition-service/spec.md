# definition-service Spec

## Purpose

The define service (`src/services/definitionService/`) evaluates Apache Velocity templates for Normal attribute definitions and generates persistent unique attribute values. It operates as a stateless service that receives FusionRun for accessing shared state.
## Requirements
### Requirement: DefinitionService evaluates Velocity templates for normal attributes

DefinitionService SHALL evaluate Apache Velocity templates for Normal attribute definitions, rendering values from the Velocity context built from the FusionAccount's attribute bag, managed account snapshots, identity data, and helper objects.

#### Scenario: Normal attribute rendered from Velocity expression
- **WHEN** DefinitionService.refreshNormalAttributes is called with a FusionAccount
- **THEN** each Normal attribute definition's expression SHALL be evaluated against the Velocity context
- **AND** the rendered value SHALL be written to fusionAccount.attributes[definition.name]

### Requirement: DefinitionService generates unique attribute values with collision handling

DefinitionService SHALL generate unique attribute values for Unique attribute definitions, using the configured uniqueness strategy (UUID, incremental counter, or collision-based disambiguation with $counter).

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
- **GIVEN** a Unique definition with useIncrementalCounter enabled
- **WHEN** refreshUniqueAttributes evaluates the definition
- **THEN** the persistent counter SHALL increment on each evaluation
- **AND** the generated value SHALL incorporate the incremented counter

### Requirement: DefinitionService manages unique value registries

DefinitionService SHALL maintain per-attribute sets of registered unique values to prevent collisions. It SHALL provide register and unregister operations for lifecycle management.

#### Scenario: Unique values registered after generation
- **WHEN** a unique attribute value is successfully generated
- **THEN** the value SHALL be added to the registered set for that attribute

#### Scenario: Unique values unregistered on account removal
- **WHEN** unregisterUniqueAttributes is called for a FusionAccount
- **THEN** all unique values owned by that account SHALL be removed from registered sets

### Requirement: DefinitionService applies output transforms in canonical order

DefinitionService SHALL apply the transform pipeline (trim → case → spaces → normalize → counter-aware maxLength) to Velocity-rendered values in exact order.

#### Scenario: All transforms applied in order
- **WHEN** a raw value "  HELLO WORLD  " is processed with trim, lower, spaces, maxLength:11
- **THEN** trim produces "HELLO WORLD"
- **AND** case produces "hello world"
- **AND** spaces produces "helloworld"
- **AND** maxLength leaves "helloworld" unchanged

### Requirement: DefinitionService ensures core schema attributes are never empty

DefinitionService SHALL guarantee that fusionIdentityAttribute and fusionDisplayAttribute always have values, falling back to generated UUIDs or account names when no definition produces a value.

#### Scenario: Identity attribute falls back to UUID
- **GIVEN** a FusionAccount with no definition producing an identity attribute value
- **WHEN** ensureCoreSchemaAttributes is called
- **THEN** a v4 UUID SHALL be assigned to fusionIdentityAttribute

#### Scenario: Display attribute falls back to account name
- **GIVEN** a FusionAccount with no definition producing a display attribute value
- **WHEN** ensureCoreSchemaAttributes is called
- **THEN** the account name SHALL be assigned to fusionDisplayAttribute

### Requirement: DefinitionService manages counter state

DefinitionService SHALL persist counter state across operation runs via StateWrapper, using LockService for thread-safe increments in parallel processing.

#### Scenario: Persistent counter increments safely
- **WHEN** two concurrent operations increment the same counter
- **THEN** each SHALL receive a unique increment value
- **AND** no values SHALL be skipped or duplicated

### Requirement: DefinitionService is stateless between methods

DefinitionService SHALL receive FusionRun as a parameter for accessing shared state. Internal caches (unique registries, counter state) SHALL be thread-safe and not leak between operation runs.

#### Scenario: DefinitionService can be shared across concurrent operations
- **WHEN** two concurrent operations call DefinitionService methods with different FusionRun instances
- **THEN** there SHALL be no cross-contamination of unique registries or counter state

### Requirement: DefinitionService utilizes shared snapshot key generator

DefinitionService SHALL utilize a centrally exported shared utility (`getManagedAccountSnapshotKey`) for generating snapshot keys from account attributes to avoid logic duplication across services.

#### Scenario: Definition checks use the shared snapshot key utility
- **WHEN** DefinitionService requires a snapshot key for a managed account snapshot
- **THEN** it invokes the exported utility rather than a local implementation

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

### Requirement: DefinitionService exposes UniqueRegistrationPlan

DefinitionService SHALL precompute a `UniqueRegistrationPlan` at construction from `uniqueAttributeDefinitions` and `attributeMaps`. The plan SHALL contain: (1) `uniqueNames` — all unique definition names; (2) `mapTargets` — names in both unique definitions and attribute map `newAttribute` values; (3) `passthroughNames` — unique names not in `mapTargets` (values read from source attributes after hydration when the source attribute name matches).

#### Scenario: Plan intersects maps with unique definitions

- **GIVEN** unique definitions for `employeeId` and `email`
- **AND** attribute maps targeting `employeeId` but not `email`
- **WHEN** DefinitionService builds the registration plan
- **THEN** `mapTargets` SHALL contain `employeeId` only
- **AND** `passthroughNames` SHALL contain `email`

### Requirement: DefinitionService registers unique values from record managed accounts

DefinitionService SHALL expose a method to register unique attribute values from a managed source account using the registration plan: hydrate a minimal FusionAccount, apply selective mapping for `mapTargets` only, then call `registerUniqueAttributes`. Normal attribute definitions and unique-definition Velocity evaluation SHALL NOT run on this path.

#### Scenario: Mapped unique value registered

- **GIVEN** a managed account whose source attribute maps to unique definition name `employeeId`
- **WHEN** record unique registration runs for that account
- **THEN** the mapped value SHALL be added to the unique value registry for `employeeId`

#### Scenario: Passthrough unique value registered

- **GIVEN** a managed account with source attribute `email` matching a unique definition name `email`
- **AND** `email` is not in `mapTargets`
- **WHEN** record unique registration runs
- **THEN** the source attribute value SHALL be registered for `email`

#### Scenario: Missing value skipped without error

- **GIVEN** a managed account with no value for a unique definition name
- **WHEN** record unique registration runs
- **THEN** registration SHALL skip that attribute
- **AND** processing SHALL continue for remaining unique names

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

---

