## ADDED Requirements

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
