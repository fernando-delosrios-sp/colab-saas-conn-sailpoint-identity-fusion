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

MappingService SHALL derive explicit mapping configuration from the user-configured attributeMaps array and defaultAttributeMerge policy. Explicit mapping targets SHALL be every `attributeMaps.newAttribute`. On a full map, MappingService SHALL also evaluate unmapped snapshot keys as defined in “MappingService merges unmapped snapshot keys with the default merge”. MappingService SHALL NOT include Fusion schema attributes as mapping targets solely because they appear on the schema.

#### Scenario: Explicit maps remain mapping targets

- **WHEN** MappingService builds its mapping configuration
- **THEN** every attribute named in `attributeMaps.newAttribute` SHALL be an explicit mapping target

#### Scenario: Schema attributes are included as mapping targets
- **WHEN** MappingService builds its mapping configuration
- **THEN** every attribute named in `attributeMaps.newAttribute` SHALL be a mapping target
- **AND** Fusion schema attributes SHALL NOT be mapping targets solely because they appear on the schema

#### Scenario: Schema attributes without a snapshot key are not implicit targets

- **GIVEN** a Fusion schema attribute that is not in `attributeMaps` and does not appear on any live snapshot this invocation
- **WHEN** MappingService builds implicit mapping targets
- **THEN** that schema attribute SHALL NOT be a mapping target

### Requirement: MappingService merges unmapped snapshot keys with the default merge

On a full `mapAttributes` invocation (`onlyTargets` omitted), after explicit mapping targets are processed, MappingService SHALL also merge **unmapped snapshot keys**: attribute names that appear on at least one live snapshot in `sourceAttributeMap` this invocation, that are not `attributeMaps[].newAttribute` targets, and that are not on the denylist (Fusion control attributes, Fusion identity/display `id` and `name`, snapshot overlay fields `source`, `schema`, and `IIQDisabled`). Each unmapped snapshot key SHALL use the global `attributeMerge` default and same-name lookup through `processAttributeMapping`. Empty results SHALL follow the same write, delete, and identity-bag fallback path as explicit maps. MappingService SHALL NOT treat Fusion schema names that never appear on this invocation’s snapshots as mapping targets.

#### Scenario: Unmapped same-named key uses stored First found default

- **GIVEN** two managed account snapshots on a Fusion account
- **AND** both have `department` with different values
- **AND** there is no attribute map whose `newAttribute` is `department`
- **AND** global `attributeMerge` is First found
- **WHEN** `mapAttributes` runs without `onlyTargets`
- **THEN** `department` SHALL be taken with First found across those snapshots
- **AND** the result SHALL be written to `fusionAccount.attributeBag.current`

#### Scenario: Unmapped key uses Main account default

- **GIVEN** an origin snapshot with `department` `"Origin"`
- **AND** a valid `mainAccount` snapshot with `department` `"Main"`
- **AND** there is no attribute map for `department`
- **AND** global `attributeMerge` is Main account
- **WHEN** `mapAttributes` runs without `onlyTargets`
- **THEN** `department` SHALL be `"Main"`

#### Scenario: Unmapped Main account miss does not take a sibling snapshot

- **GIVEN** a valid `mainAccount` snapshot with no `department`
- **AND** another snapshot has `department` `"Other"`
- **AND** there is no attribute map for `department`
- **AND** global `attributeMerge` is Main account
- **WHEN** `mapAttributes` runs without `onlyTargets`
- **THEN** `department` SHALL NOT be taken from the other snapshot

#### Scenario: Overlay and control keys are not implicit targets

- **GIVEN** a managed snapshot that includes overlay fields `source`, `schema`, and `IIQDisabled`
- **WHEN** `mapAttributes` runs without `onlyTargets`
- **THEN** MappingService SHALL NOT write `source`, `schema`, or `IIQDisabled` onto `attributeBag.current` as implicit map results

#### Scenario: Schema-only names are not mapping targets

- **GIVEN** the Fusion account schema includes `cloudLifecycleState`
- **AND** no live snapshot this invocation has `cloudLifecycleState`
- **AND** there is no attribute map for `cloudLifecycleState`
- **WHEN** `mapAttributes` runs without `onlyTargets`
- **THEN** MappingService SHALL NOT evaluate `cloudLifecycleState` as a mapping target

### Requirement: MappingService registers the Identities snapshot when the identity bag is present

When identity scope is enabled and `attributeBag.identity` is non-empty, MappingService SHALL register that bag as source `Identities` in `sourceAttributeMap`, include `Identities` in source order if missing, and index it in the per-invocation snapshot-key index under the identity id. Origin and main snapshot resolution SHALL use that index for both managed keys and the identity id. MappingService SHALL NOT use a separate merge algebra for identity-origin Fusion accounts. When identity scope is disabled, MappingService SHALL exclude the identity bag from managed-origin Fusion accounts and remove any stale `Identities` snapshot before mapping. Identity-origin Fusion accounts explicitly created for required support identities, such as global reviewers, SHALL retain their own identity snapshot.

#### Scenario: Disabled identity scope excludes the Identities snapshot

- **GIVEN** `includeIdentities` is `false`
- **AND** a managed-origin Fusion account has a non-empty identity bag
- **AND** managed snapshots do not contain `firstname`, `lastname`, or `department`
- **WHEN** `mapAttributes` runs
- **THEN** the identity bag SHALL NOT contribute mapped or unmapped values
- **AND** `Identities` SHALL NOT remain in `sourceAttributeMap`

#### Scenario: Origin resolves through the index for identity-origin

- **GIVEN** an identity-origin Fusion account
- **AND** a non-empty identity bag
- **AND** `originAccount` equals the identity id
- **WHEN** `mapAttributes` runs
- **THEN** the origin snapshot SHALL be that identity bag
- **AND** Origin account merge SHALL read values from it

#### Scenario: Main account can resolve to the Identities snapshot

- **GIVEN** a Fusion account with a non-empty identity bag
- **AND** `mainAccount` equals the identity id
- **AND** a linked managed account has a different `department`
- **AND** the mapping or unmapped key for `department` uses Main account merge
- **WHEN** `mapAttributes` runs
- **THEN** `department` SHALL come from the identity bag

#### Scenario: Managed-origin Fusion account indexes Identities when the bag is present

- **GIVEN** a managed-origin Fusion account
- **AND** a non-empty identity bag
- **AND** `mainAccount` equals the identity id
- **WHEN** `mapAttributes` resolves the main snapshot
- **THEN** MappingService SHALL find the identity bag in the snapshot-key index

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

MappingService SHALL accept an optional `onlyTargets` parameter on `mapAttributes`. When provided, MappingService SHALL evaluate attribute mappings only for target names in that set (plus system-required side effects for `mainAccount` and `history` when those targets are included) and SHALL NOT merge additional unmapped snapshot keys. When omitted, MappingService SHALL process explicit mapping targets and then unmapped snapshot keys.

#### Scenario: Selective map processes coincident targets only

- **GIVEN** attribute maps for `employeeId`, `displayName`, and `department`
- **AND** live snapshots also have unmapped `title`
- **AND** `onlyTargets` is `Set(['employeeId'])`
- **WHEN** `mapAttributes` runs on a managed FusionAccount
- **THEN** only the `employeeId` mapping SHALL be evaluated and written
- **AND** `displayName`, `department`, and `title` SHALL NOT be modified by mapping on this invocation

#### Scenario: Full map when onlyTargets omitted

- **GIVEN** the same attribute map configuration
- **AND** live snapshots have unmapped `title`
- **WHEN** `mapAttributes` is called without `onlyTargets`
- **THEN** all configured mapping targets SHALL be processed
- **AND** unmapped snapshot key `title` SHALL be processed with the default merge

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


