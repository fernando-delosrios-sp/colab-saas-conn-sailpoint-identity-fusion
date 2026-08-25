# definition-service Spec

## Purpose

The define service (`src/services/definitionService/`) evaluates Apache Velocity templates for Normal attribute definitions and generates persistent unique attribute values. It operates as a stateless service that receives FusionRun for accessing shared state.
## Requirements
### Requirement: DefinitionService evaluates Velocity templates for normal attributes

DefinitionService SHALL evaluate Apache Velocity templates for Normal attribute definitions, rendering values from the Velocity context built from the FusionAccount's attribute bag, managed account snapshots, identity data, and helper objects. When evaluation produces a non-nullish value, it SHALL write that value to `fusionAccount.attributes`. When evaluation produces a nullish value or fails, it SHALL clear the attribute per the clearing requirement unless a core-schema safe default applies.

#### Scenario: Normal attribute rendered from Velocity expression
- **WHEN** DefinitionService.refreshNormalAttributes is called with a FusionAccount
- **THEN** each Normal attribute definition's expression SHALL be evaluated against the Velocity context
- **AND** when the rendered value is non-nullish, it SHALL be written to `fusionAccount.attributes[definition.name]`

#### Scenario: Non-nullish rendered value overwrites existing value
- **GIVEN** an existing Fusion account with attribute `fullName` set to `"Jane Doe"`
- **AND** a Normal definition for `fullName` that evaluates to `"Jane Smith"`
- **WHEN** `refreshNormalAttributes` processes the definition
- **THEN** `fullName` MUST equal `"Jane Smith"`

---

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

### Requirement: DefinitionService clears normal attributes on falsy or failed evaluation

When `DefinitionService` evaluates a Normal attribute definition and the template produces no value or evaluation fails, it MUST remove the attribute from the Fusion account unless a core-schema safe default applies.

#### Scenario: Falsy template output clears previously stored value
- **GIVEN** an existing Fusion account with attribute `formattedDate` set to `"2024-01-15"`
- **AND** a Normal definition for `formattedDate` whose expression evaluates to empty output (undefined/null after template pipeline)
- **WHEN** `refreshNormalAttributes` processes the definition
- **THEN** `formattedDate` MUST be removed from `fusionAccount.attributes`
- **AND** `formattedDate` MUST be removed from the Velocity evaluation context

#### Scenario: Template evaluation error clears previously stored value
- **GIVEN** an existing Fusion account with attribute `department` set to `"Engineering"`
- **AND** a Normal definition for `department` whose expression evaluation returns an error
- **WHEN** `refreshNormalAttributes` processes the definition
- **THEN** `department` MUST be removed from `fusionAccount.attributes`
- **AND** `department` MUST be removed from the Velocity evaluation context

#### Scenario: Core schema attribute receives safe default instead of clearing
- **GIVEN** a Fusion account with no valid value for `fusionDisplayAttribute`
- **AND** a Normal definition for the display attribute whose expression evaluates to empty output
- **WHEN** `refreshNormalAttributes` processes the definition
- **THEN** `fusionAttributeSafeDefault` MUST be applied for the display attribute
- **AND** the attribute MUST NOT be left empty

#### Scenario: Static definition with existing value skips evaluation
- **GIVEN** an existing Fusion account with a valid value for a Static Normal definition
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the definition MUST NOT be evaluated
- **AND** the stored value MUST remain unchanged

### Requirement: DefinitionService Velocity caller context does not clone the current bag

`buildVelocityContext` SHALL expose current Fusion account attributes to templates without shallow-copying `attributeBag.current` into a new object that holds those attributes as own properties. Special keys (`identity`, `accounts`, `previous`, `sources`, `account`, `originSource`, `originAccount`) SHALL remain own properties on the context object so they override any same-named current attributes, matching pre-change spread-then-assign behavior. Sequential Normal definition writes SHALL still update `fusionAccount.attributes` and the evaluation context for later definitions.

#### Scenario: Later Normal definition sees an earlier write
- **GIVEN** Normal definitions `first` then `full` where `full`’s expression is `"$first"`
- **AND** `first` evaluates to `"Ada"`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** `full` SHALL be `"Ada"`

#### Scenario: Special context keys override current bag names
- **GIVEN** `attributeBag.current.identity` is the string `"not-the-identity-object"`
- **AND** the Fusion account has an identity bag with `name` `"Jane"`
- **AND** a Normal definition expression `"$identity.name"`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the defined attribute SHALL be `"Jane"`

#### Scenario: Render context remains null-prototype at evaluateVelocityTemplate
- **GIVEN** any Normal definition evaluation
- **WHEN** `evaluateVelocityTemplate` builds the render context
- **THEN** `Object.getPrototypeOf(renderContext)` SHALL still be `null`
- **AND** helper keys SHALL still override caller context keys

#### Scenario: Inherited current-bag attributes are visible to templates
- **GIVEN** a Velocity caller context whose prototype is `attributeBag.current`
- **AND** `attributeBag.current` has `firstname` `"Ada"` and `lastname` `"Lovelace"` as own properties
- **AND** a Normal definition expression `"${firstname} ${lastname}"`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the defined attribute SHALL be `"Ada Lovelace"`
- **AND** own caller-context keys SHALL still override same-named inherited current-bag keys

### Requirement: Disabled identity scope excludes identity data from Define

When `includeIdentities` is `false`, DefinitionService SHALL NOT expose the identity bag, identity alias, or an Identities origin snapshot from managed-origin rows through the Velocity context. Identity-derived display-attribute overrides SHALL also be disabled for those rows. Managed account snapshots and current mapped attributes SHALL remain available. Identity-origin rows explicitly created for required support identities, such as global reviewers, SHALL retain their own identity context.

#### Scenario: Normal definition cannot read identity attributes when identity scope is disabled
- **GIVEN** `includeIdentities` is `false`
- **AND** a managed-origin Fusion account has an identity bag with `department` `"Identity HR"`
- **AND** a Normal definition expression `"$!identity.department"`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the defined attribute SHALL be absent

### Requirement: Normal definition evaluation is synchronous per definition

`processNormalDefinition` SHALL NOT return a Promise. `refreshNormalAttributes` MAY remain async for its public signature but SHALL NOT await a Promise per Normal definition that only performs synchronous Velocity evaluation.

#### Scenario: Falsy evaluation still clears
- **GIVEN** an existing Fusion account with attribute `formattedDate` `"2024-01-15"`
- **AND** a Normal definition for `formattedDate` whose expression evaluates to empty
- **WHEN** `refreshNormalAttributes` processes the definition
- **THEN** `formattedDate` MUST be removed from `fusionAccount.attributes`

### Requirement: evaluateVelocityTemplate does not debug-log every render

`evaluateVelocityTemplate` SHALL NOT call the connector-sdk `logger.debug` for the expression, cache miss, or result on the evaluation path. Template compile caching and null-prototype helper merge SHALL remain.

#### Scenario: Template still renders without debug logging
- **GIVEN** expression `"$firstName"` and context `{ firstName: "John" }`
- **WHEN** `evaluateVelocityTemplate` runs
- **THEN** the result SHALL be `"John"`
- **AND** the call SHALL NOT require debug logging to be enabled

---

### Requirement: Record unique registration processes accounts in bounded parallel batches

`registerUniqueValuesFromRecordManagedAccounts` SHALL register eligible Record managed accounts using bounded parallel batches. Batch size SHALL be the Fusion parallel batch size (`max(1, min(managedAccountsBatchSize, 12))`). Unique-set mutations SHALL remain serialized per unique attribute name using the existing unique-attribute lock. The method SHALL still apply the registration plan (selective Map for `mapTargets`, passthrough names, skip missing values) and SHALL NOT run Normal or Unique Velocity generation. The set of registered values SHALL be independent of batching (same members as a serial walk of the same input list).

#### Scenario: Parallel registration yields the same unique set as a serial walk

- **GIVEN** 25 Record managed accounts each with a distinct mappable unique attribute value
- **AND** Fusion parallel batch size is 12
- **WHEN** `registerUniqueValuesFromRecordManagedAccounts` runs
- **THEN** all 25 values SHALL be present in the unique registry for that attribute
- **AND** registration SHALL have used more than one batch

#### Scenario: Unique-set writes remain lock-serialized per attribute name

- **GIVEN** two Record managed accounts that register the same unique attribute name in one batch
- **WHEN** record unique registration runs
- **THEN** both registration attempts SHALL enter the existing per-name unique lock
- **AND** the unique registry SHALL contain each distinct value once

#### Scenario: Missing values still skip without error

- **GIVEN** a Record managed account with no value for a unique definition name
- **WHEN** record unique registration runs in a parallel batch
- **THEN** registration SHALL skip that attribute
- **AND** processing SHALL continue for remaining accounts

### Requirement: Unique generation holds the unique registry lock only for membership check and insert

When `refreshUniqueAttributes` generates a new unique attribute value, Velocity evaluation (including `$UUID` injection and `$counter` substitution) SHALL run outside `locks.withLock` for key `unique:${definition.name}`. That lock SHALL cover only reading and updating the in-memory registered-value set for that attribute (check absence, then add, or observe collision). Collision retries SHALL re-evaluate outside the lock and re-enter the lock for the next membership attempt. Incremental counter increments SHALL use the existing counter lock and SHALL NOT extend the unique-registry lock across template evaluation. Collision semantics SHALL remain: first collision-strategy attempt uses empty `$counter`; generation stops after the configured max attempts. Existing unique values SHALL still be preserved when the account is not reset.

#### Scenario: Template evaluation is not inside the unique registry lock

- **GIVEN** a Unique definition whose Velocity expression reads current attributes
- **WHEN** `refreshUniqueAttributes` generates a new value
- **THEN** `evaluateAttributeTemplate` SHALL run while `unique:${definition.name}` is not held
- **AND** the generated value SHALL still be added to the registered set before the method returns success

#### Scenario: Collision still disambiguates under a short lock

- **GIVEN** a Unique definition that collides on the first rendered value
- **WHEN** `refreshUniqueAttributes` retries with `$counter`
- **THEN** the first attempt SHALL use empty `$counter`
- **AND** a later attempt SHALL produce a value not already in the registered set
- **AND** each membership check/insert SHALL occur under `unique:${definition.name}`

#### Scenario: Concurrent Output-batch generation does not duplicate values

- **GIVEN** two Fusion accounts in the same Output batch that both need a new value for the same Unique attribute
- **WHEN** `refreshUniqueAttributes` runs concurrently for both
- **THEN** the two stored attribute values SHALL be distinct
- **AND** both values SHALL be present in the registered set

#### Scenario: Existing unique values remain preserved

- **GIVEN** an existing Fusion account with a Unique attribute already set
- **AND** the account is not being reset
- **WHEN** `refreshUniqueAttributes` runs
- **THEN** the existing value SHALL be kept
- **AND** no new Velocity generation SHALL run for that attribute

### Requirement: Normal definitions honor the refresh flag per definition

When `DefinitionService.refreshNormalAttributes` processes Normal attribute definitions, each definition SHALL respect its configured `refresh` flag in combination with account refresh signals. A definition with `refresh: false` SHALL NOT be evaluated when the Fusion account has an existing value, is not being reset, force attribute refresh is disabled, and `needsRefresh` is false. A definition with `refresh: true` SHALL still be evaluated on every aggregation even when `needsRefresh` is false.

#### Scenario: refresh false skips unchanged account

- **GIVEN** a Normal definition with `refresh: false` and an existing non-empty attribute value
- **AND** the Fusion account has `needsRefresh: false` and `needsReset: false`
- **AND** force attribute refresh is disabled
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the definition SHALL NOT be evaluated
- **AND** the stored attribute value SHALL remain unchanged

#### Scenario: refresh true runs every aggregation

- **GIVEN** a Normal definition with `refresh: true`
- **AND** the Fusion account has `needsRefresh: false`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the definition SHALL be evaluated
- **AND** a newly rendered value SHALL replace the previous value when evaluation succeeds

#### Scenario: needsRefresh triggers refresh false definitions

- **GIVEN** a Normal definition with `refresh: false` and an existing value
- **AND** the Fusion account has `needsRefresh: true` because underlying managed source data changed
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the definition SHALL be evaluated

#### Scenario: force attribute refresh triggers refresh false definitions

- **GIVEN** a Normal definition with `refresh: false` and an existing value
- **AND** Developer Settings force attribute refresh is enabled for the run
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the definition SHALL be evaluated

### Requirement: Account-level Define entry does not force all accounts when any definition refreshes

`refreshNormalAttributes` SHALL enter the Normal definition loop when the Fusion account has `needsRefresh`, `needsReset`, or force attribute refresh enabled, or when at least one Normal definition has `refresh: true` and is eligible for evaluation on that account. It SHALL NOT treat the presence of any refresh-enabled definition in connector configuration as forcing Define for every Fusion account regardless of account refresh state.

#### Scenario: Stale account skips Define when no refresh true definitions apply

- **GIVEN** connector configuration where every Normal definition has `refresh: false`
- **AND** a Fusion account with `needsRefresh: false` and populated attribute values
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the method SHALL return without evaluating definitions

### Requirement: Normal Define reuses one render context per account refresh pass

During a single `refreshNormalAttributes` invocation for one Fusion account, `evaluateVelocityTemplate` SHALL NOT shallow-copy the full caller context on every definition evaluation. The implementation SHALL build one null-prototype render context per refresh pass, merge helpers once, and update that context with each definition write so later definitions observe earlier writes.

#### Scenario: Later definition sees earlier write without per-eval full copy

- **GIVEN** Normal definitions `first` then `second` where `second` expression references `$first`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** `second` SHALL reflect the value written by `first`
- **AND** `Object.getPrototypeOf(renderContext)` SHALL be `null` for each evaluation

#### Scenario: Helper keys override caller context keys

- **GIVEN** a Velocity evaluation during Normal Define
- **WHEN** the render context is constructed for that refresh pass
- **THEN** exported context helpers SHALL remain accessible
- **AND** helper keys SHALL override same-named caller properties

