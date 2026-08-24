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
