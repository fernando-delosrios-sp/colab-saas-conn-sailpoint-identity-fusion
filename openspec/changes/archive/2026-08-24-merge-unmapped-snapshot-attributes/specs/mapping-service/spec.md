## ADDED Requirements

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

When `attributeBag.identity` is non-empty, MappingService SHALL register that bag as source `Identities` in `sourceAttributeMap`, include `Identities` in source order if missing, and index it in the per-invocation snapshot-key index under the identity id. Origin and main snapshot resolution SHALL use that index for both managed keys and the identity id. MappingService SHALL NOT use a separate merge algebra for identity-origin Fusion accounts.

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

#### Scenario: Managed-origin row indexes Identities when the bag is present

- **GIVEN** a managed-origin Fusion account
- **AND** a non-empty identity bag
- **AND** `mainAccount` equals the identity id
- **WHEN** `mapAttributes` resolves the main snapshot
- **THEN** MappingService SHALL find the identity bag in the snapshot-key index

---

## MODIFIED Requirements

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
