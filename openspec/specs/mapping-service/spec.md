# mapping-service Spec

## Purpose

The map service (`src/services/mappingService/`) merges attributes from managed source accounts into the Fusion account schema using configurable merge strategies. It operates as a stateless service that receives all its input data from FusionRun.
## Requirements
### Requirement: MappingService merges managed source attributes into Fusion accounts

The MappingService SHALL provide attribute consolidation from managed source accounts into the Fusion account schema. It SHALL apply configurable merge strategies (first-found, source-specific, concatenate, distinct-list, Main account, Origin account) in the ordered sequence defined by the source configuration, except that Main account and Origin account strategies read a single account snapshot and do not walk source order.

#### Scenario: Attribute merged with first-found strategy
- **WHEN** MappingService.mapAttributes is called with a FusionAccount and configured source order
- **THEN** for each mapped attribute, the first non-empty value across sources in order SHALL be selected
- **AND** the result SHALL be written to fusionAccount.attributeBag.current

#### Scenario: Attribute merged with source-specific strategy
- **WHEN** an attribute map specifies a source name and merge strategy is "source"
- **THEN** only accounts from the specified source SHALL be consulted
- **AND** the first match within that source SHALL be used

#### Scenario: Identity-type accounts skip mapping
- **WHEN** a FusionAccount has type FusionAccountKind.Identity
- **THEN** mapAttributes SHALL return immediately without modifying the attribute bag

### Requirement: MappingService applies Main account merge without fallback

When the merge strategy is Main account (`mainAccount`), MappingService SHALL read mapped attribute values from a single snapshot: the `mainAccount` managed account when that key is present and found in the source attribute map this run, otherwise the origin snapshot. MappingService SHALL NOT consult other sources or sibling accounts on the same source. If the chosen snapshot is missing or has no value for the mapped attributes, MappingService SHALL treat the result as empty (undefined).

#### Scenario: Main account merge uses mainAccount snapshot when found
- **GIVEN** a Fusion account whose origin snapshot has `jobTitle` `"Engineer"`
- **AND** `mainAccount` identifies a managed account that has `jobTitle` `"Manager"`
- **AND** the mapping for `jobTitle` uses Main account merge
- **WHEN** `mapAttributes` runs
- **THEN** `jobTitle` SHALL be `"Manager"`

#### Scenario: Main account merge falls back to origin snapshot when mainAccount is unset
- **GIVEN** a Fusion account with no valid `mainAccount`
- **AND** the origin snapshot has `jobTitle` `"Engineer"`
- **AND** another source account has `jobTitle` `"Manager"`
- **AND** the mapping for `jobTitle` uses Main account merge
- **WHEN** `mapAttributes` runs
- **THEN** `jobTitle` SHALL be `"Engineer"`

#### Scenario: Main account merge does not fall through when the chosen snapshot lacks the attribute
- **GIVEN** a Fusion account whose `mainAccount` snapshot has no `jobTitle`
- **AND** another source account has `jobTitle` `"Manager"`
- **AND** the mapping for `jobTitle` uses Main account merge
- **WHEN** `mapAttributes` runs
- **THEN** `jobTitle` SHALL NOT be taken from the other source account

### Requirement: MappingService applies Origin account merge without fallback

When the merge strategy is Origin account (`originAccount`), MappingService SHALL read mapped attribute values from the origin snapshot only and SHALL ignore `mainAccount`. MappingService SHALL NOT consult other sources or sibling accounts. If the origin snapshot is missing or has no value for the mapped attributes, MappingService SHALL treat the result as empty (undefined).

#### Scenario: Origin account merge ignores mainAccount
- **GIVEN** a Fusion account whose origin snapshot has `jobTitle` `"Engineer"`
- **AND** `mainAccount` identifies a managed account that has `jobTitle` `"Manager"`
- **AND** the mapping for `jobTitle` uses Origin account merge
- **WHEN** `mapAttributes` runs
- **THEN** `jobTitle` SHALL be `"Engineer"`

#### Scenario: Origin account merge uses the Identities identity bag for identity-origin Fusion accounts
- **GIVEN** an identity-origin Fusion account (`originSource` is Identities)
- **AND** the identity bag has `department` `"HR"`
- **AND** a linked managed account has `department` `"IT"`
- **AND** `mainAccount` is unset
- **AND** the mapping for `department` uses Origin account merge
- **WHEN** `mapAttributes` runs
- **THEN** `department` SHALL be `"HR"`

#### Scenario: Origin account merge pins the origin account key not the first account on originSource
- **GIVEN** two managed accounts from the origin source on the Fusion account
- **AND** `originAccount` identifies the second of those accounts
- **AND** only the origin account has `email` `"origin@acme.com"`
- **AND** the mapping for `email` uses Origin account merge
- **WHEN** `mapAttributes` runs
- **THEN** `email` SHALL be `"origin@acme.com"`

### Requirement: New-install default attribute merge is Main account

The connector spec initial value and runtime default for global `attributeMerge` SHALL be `mainAccount`. Stored `attributeMerge` values on existing sources SHALL be left unchanged. The `$originSource` Source-name token SHALL keep its current source-level resolution.

#### Scenario: Missing attributeMerge key uses Main account default
- **GIVEN** configuration with no `attributeMerge` key
- **WHEN** settings are read
- **THEN** the default merge strategy SHALL be Main account (`mainAccount`)

#### Scenario: Stored first merge is not migrated
- **GIVEN** an existing source with `attributeMerge` `"first"`
- **WHEN** MappingService maps attributes
- **THEN** First found behavior SHALL apply
- **AND** Main account merge SHALL NOT be substituted

### Requirement: MappingService respects mainAccount prioritization

When the mainAccount attribute is set on a FusionAccount, MappingService SHALL prioritize that account's attribute values when resolving mappings.

#### Scenario: mainAccount value used for attribute resolution
- **GIVEN** a FusionAccount with mainAccount set to a valid managed account key
- **WHEN** mapAttributes resolves an attribute value
- **THEN** the mainAccount snapshot SHALL be checked first before falling back to source order

### Requirement: MappingService configuration is derived from attributeMaps

MappingService SHALL derive its attribute mapping configuration from the user-configured attributeMaps array and defaultAttributeMerge policy. Mapping targets SHALL include both schema-defined attributes and explicitly mapped attributes.

#### Scenario: Schema attributes are included as mapping targets
- **WHEN** MappingService builds its mapping configuration
- **THEN** every attribute in the Fusion account schema SHALL be a mapping target
- **AND** every attribute named in attributeMaps.newAttribute SHALL be a mapping target

### Requirement: MappingService is stateless

MappingService SHALL NOT hold mutable state between invocations. All configuration SHALL be set at construction time. All operations SHALL receive their input data from FusionRun.

#### Scenario: MappingService can be shared across concurrent operations
- **WHEN** two concurrent operations call MappingService.mapAttributes with different FusionRun instances
- **THEN** there SHALL be no cross-contamination of state between operations

### Requirement: MappingService utilizes shared snapshot key generator

MappingService SHALL utilize a centrally exported shared utility (`getManagedAccountSnapshotKey`) for generating snapshot keys from account attributes to avoid logic duplication across services.

#### Scenario: Mapping uses the shared snapshot key utility
- **WHEN** MappingService requires a snapshot key for a managed account
- **THEN** it invokes the exported utility rather than implementing a local fallback

### Requirement: MappingService supports selective target mapping

MappingService SHALL accept an optional `onlyTargets` parameter on `mapAttributes`. When provided, MappingService SHALL evaluate attribute mappings only for target names in that set (plus system-required side effects for `mainAccount` and `history` when those targets are included). When omitted, behavior SHALL remain unchanged (all mapping targets processed).

#### Scenario: Selective map processes coincident targets only

- **GIVEN** attribute maps for `employeeId`, `displayName`, and `department`
- **AND** `onlyTargets` is `Set(['employeeId'])`
- **WHEN** `mapAttributes` runs on a managed FusionAccount
- **THEN** only the `employeeId` mapping SHALL be evaluated and written
- **AND** `displayName` and `department` SHALL NOT be modified by mapping on this invocation

#### Scenario: Full map when onlyTargets omitted

- **GIVEN** the same attribute map configuration
- **WHEN** `mapAttributes` is called without `onlyTargets`
- **THEN** all configured mapping targets SHALL be processed as today

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


