## ADDED Requirements

### Requirement: MappingService precomputes lookup attribute names

`buildAttributeMappingConfig` SHALL set `lookupAttributeNames` to the unique list of `sourceAttributes` followed by `attributeName` (same membership as a `Set` of those names). `processAttributeMapping` SHALL use `lookupAttributeNames` and SHALL NOT allocate a new Set of source attribute names on each invocation.

#### Scenario: Lookup names include source and target names once

- **GIVEN** an attribute map with `newAttribute` `employeeId` and `existingAttributes` `['emp_id', 'employeeId']`
- **WHEN** `buildAttributeMappingConfig` runs for `employeeId`
- **THEN** `lookupAttributeNames` SHALL contain `emp_id` and `employeeId` with no duplicates

#### Scenario: Mapping uses precomputed lookup names

- **GIVEN** a mapping config whose `lookupAttributeNames` is `['emp_id']`
- **AND** a managed account snapshot that has `emp_id` `"E1"` and `employeeId` `"E2"`
- **WHEN** `processAttributeMapping` runs with First found merge
- **THEN** the mapped value SHALL be `"E1"`
- **AND** `employeeId` on the snapshot SHALL NOT be consulted

### Requirement: MappingService indexes snapshots once per mapAttributes invocation

When `mapAttributes` needs origin or main account snapshots, MappingService SHALL build a snapshot-key index from the current `sourceAttributeMap` for that invocation and resolve origin/main (including a rewritten `mainAccount` mid-loop) through that index. The index SHALL NOT be stored as MappingService instance state. First snapshot in current `sourceAttributeMap` iteration order SHALL win when keys collide.

#### Scenario: Origin account merge uses the indexed origin snapshot

- **GIVEN** two managed accounts on the origin source
- **AND** `originAccount` identifies the second account
- **AND** only the origin account has `email` `"origin@acme.com"`
- **AND** the mapping for `email` uses Origin account merge
- **WHEN** `mapAttributes` runs
- **THEN** `email` SHALL be `"origin@acme.com"`

#### Scenario: Main account rewrite uses the same invocation index

- **GIVEN** `mainAccount` is mapped before `jobTitle`
- **AND** mapping `mainAccount` writes a key that exists in `sourceAttributeMap`
- **AND** `jobTitle` uses Main account merge
- **WHEN** `mapAttributes` runs
- **THEN** `jobTitle` SHALL come from the snapshot identified by the new `mainAccount` value

### Requirement: MappingService does not clone current attributes on a no-op map

When `needsRefresh` is false (or there is no source context to map) and Fusion account history is empty, `mapAttributes` SHALL NOT replace `attributeBag.current` with a shallow clone. When mapping is skipped but history is non-empty, MappingService MAY write `history` onto the existing current object without cloning the rest of the bag.

#### Scenario: Stale current bag is not cloned when refresh is not required

- **GIVEN** a managed Fusion account with `needsRefresh` false
- **AND** empty history
- **AND** `attributeBag.current.displayName` is `"Kept"`
- **WHEN** `mapAttributes` runs
- **THEN** `attributeBag.current.displayName` SHALL still be `"Kept"`
- **AND** `attributeBag.current` SHALL be the same object reference as before the call
