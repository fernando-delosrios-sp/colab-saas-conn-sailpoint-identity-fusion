## MODIFIED Requirements

### Requirement: Record unique registration processes accounts in bounded parallel batches

`registerUniqueValuesFromRecordManagedAccounts` SHALL register eligible Record managed accounts using bounded parallel batches. Batch size SHALL be the Fusion parallel batch size (`max(1, min(managedAccountsBatchSize, 12))`). Inserting an already-known unique attribute value via `registerUniqueAttributes` SHALL NOT take `locks.withLock` for key `unique:${definition.name}`. Check-then-add of a newly generated value SHALL still use that lock (`tryRegisterUniqueValue`). The method SHALL still apply the registration plan (selective Map for `mapTargets`, passthrough names, skip missing values) and SHALL NOT run Normal or Unique Velocity generation. The set of registered values SHALL be independent of batching (same members as a serial walk of the same input list).

#### Scenario: Parallel registration yields the same unique set as a serial walk

- **GIVEN** 25 Record managed accounts each with a distinct mappable unique attribute value
- **AND** Fusion parallel batch size is 12
- **WHEN** `registerUniqueValuesFromRecordManagedAccounts` runs
- **THEN** all 25 values SHALL be present in the unique registry for that attribute
- **AND** registration SHALL have used more than one batch

#### Scenario: Unique-set writes remain lock-serialized per attribute name

- **GIVEN** two Record managed accounts that register values for the same unique attribute name in one batch
- **WHEN** record unique registration runs
- **THEN** `registerUniqueAttributes` SHALL NOT call `withLock` with key `unique:` plus that attribute name
- **AND** the unique registry SHALL contain each distinct value once

#### Scenario: Existing-value registration does not take the unique registry lock

- **GIVEN** two Record managed accounts that register values for the same unique attribute name in one batch
- **WHEN** record unique registration runs
- **THEN** `registerUniqueAttributes` SHALL NOT call `withLock` with key `unique:` plus that attribute name
- **AND** the unique registry SHALL contain each distinct value once

#### Scenario: Missing values still skip without error

- **GIVEN** a Record managed account with no value for a unique definition name
- **WHEN** record unique registration runs in a parallel batch
- **THEN** registration SHALL skip that attribute
- **AND** processing SHALL continue for remaining accounts

## ADDED Requirements

### Requirement: Registering existing unique values does not take the unique registry lock

`DefinitionService.registerUniqueAttributes` SHALL add each present unique-definition value to the in-memory registered set without `locks.withLock` for `unique:${definition.name}`. It SHALL NOT await between locating the per-attribute set and `Set.add`. Missing values SHALL still be skipped. Collision-safe insert of a newly generated value SHALL remain in `tryRegisterUniqueValue` under that lock.

#### Scenario: Refresh unique register does not enter unique lock

- **GIVEN** a Fusion account with an existing Unique attribute value
- **WHEN** `registerUniqueAttributes` runs
- **THEN** `withLock` SHALL NOT be called with key `unique:` plus that attribute name
- **AND** the value SHALL be present in the registered set
