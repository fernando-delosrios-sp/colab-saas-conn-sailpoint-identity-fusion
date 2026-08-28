## ADDED Requirements

### Requirement: MappingService clears vanished snapshot keys

On a full `mapAttributes` invocation (`onlyTargets` omitted), MappingService SHALL treat attribute names present in `attributeBag.current` as implicit candidates alongside live-snapshot keys. A **vanished snapshot key** — a candidate that no live snapshot in `sourceAttributeMap` carries this invocation — SHALL resolve to empty through `processAttributeMapping` and SHALL be deleted from `attributeBag.current`, following the same delete and identity-bag fallback path as an explicit map whose merge yields empty. MappingService SHALL NOT require that the main or origin snapshot was fetched this invocation before clearing.

#### Scenario: Attribute dropped by its origin source clears

- **GIVEN** a Fusion account whose persisted bag has `STUDENT_ID` `"sailpoint-307803971"`
- **AND** the origin snapshot this invocation has no `STUDENT_ID`
- **AND** no other live snapshot has `STUDENT_ID`
- **AND** there is no attribute map whose `newAttribute` is `STUDENT_ID`
- **AND** `STUDENT_ID` is not a Normal or Unique attribute definition name
- **WHEN** `mapAttributes` runs without `onlyTargets`
- **THEN** `STUDENT_ID` SHALL be absent from `attributeBag.current`

#### Scenario: Attribute dropped by a record source clears

- **GIVEN** a Fusion account whose persisted bag has `department` `"Physics"` contributed by a record source
- **AND** that record source snapshot this invocation has no `department`
- **AND** no other live snapshot has `department`
- **AND** there is no attribute map for `department`
- **WHEN** `mapAttributes` runs without `onlyTargets`
- **THEN** `department` SHALL be absent from `attributeBag.current`

#### Scenario: Clearing does not require the selected snapshot to be present

- **GIVEN** global `attributeMerge` is Main account
- **AND** a Fusion account whose persisted bag has `title` `"Reader"`
- **AND** neither the `mainAccount` snapshot nor the origin snapshot was fetched this invocation
- **AND** another live snapshot exists but has no `title`
- **WHEN** `mapAttributes` runs without `onlyTargets`
- **THEN** `title` SHALL be absent from `attributeBag.current`

#### Scenario: Vanished key still present on a snapshot is merged not cleared

- **GIVEN** a Fusion account whose persisted bag has `COLLEGE_ID` `"JOHNS"`
- **AND** a live snapshot has `COLLEGE_ID` `"TRIN"`
- **AND** there is no attribute map for `COLLEGE_ID`
- **WHEN** `mapAttributes` runs without `onlyTargets`
- **THEN** `COLLEGE_ID` SHALL be `"TRIN"`

#### Scenario: Fusion account with no managed context keeps its bag

- **GIVEN** a managed-origin Fusion account with `needsRefresh` true
- **AND** no live snapshot in `sourceAttributeMap` holds any account
- **AND** the persisted bag has `STUDENT_ID` `"sailpoint-307803971"`
- **WHEN** `mapAttributes` runs without `onlyTargets`
- **THEN** `STUDENT_ID` SHALL still be `"sailpoint-307803971"`

#### Scenario: Selective mapping does not clear vanished keys

- **GIVEN** a Fusion account whose persisted bag has `STUDENT_ID` `"sailpoint-307803971"`
- **AND** no live snapshot has `STUDENT_ID`
- **AND** `onlyTargets` is `Set(['employeeId'])`
- **WHEN** `mapAttributes` runs
- **THEN** `STUDENT_ID` SHALL still be `"sailpoint-307803971"`

### Requirement: MappingService excludes definition-owned names from implicit candidates

MappingService SHALL exclude **definition-owned names** — every configured `normalAttributeDefinitions[].name` and `uniqueAttributeDefinitions[].name` — from implicit Map candidates, so Map neither merges nor clears them. Explicit `attributeMaps[].newAttribute` targets SHALL be unaffected by this exclusion. Exclusion SHALL follow the definition lists configured for the current invocation, so a name whose definition row has been removed SHALL become an ordinary implicit candidate.

#### Scenario: Unique definition value is preserved

- **GIVEN** `uniqueAttributeDefinitions` contains a definition named `UID`
- **AND** the persisted bag has `UID` `"WD000015"`
- **AND** no live snapshot has `UID`
- **WHEN** `mapAttributes` runs without `onlyTargets`
- **THEN** `UID` SHALL still be `"WD000015"`

#### Scenario: Normal definition output is left to Define

- **GIVEN** `normalAttributeDefinitions` contains a definition named `STUDENT_URL`
- **AND** the persisted bag has `STUDENT_URL` with a value
- **AND** no live snapshot has `STUDENT_URL`
- **WHEN** `mapAttributes` runs without `onlyTargets`
- **THEN** MappingService SHALL NOT delete `STUDENT_URL`

#### Scenario: Definition-owned name on a snapshot is not merged by Map

- **GIVEN** `normalAttributeDefinitions` contains a definition named `CRSID`
- **AND** a live snapshot has `CRSID` `"sailpoint-AH2543"`
- **AND** there is no attribute map whose `newAttribute` is `CRSID`
- **WHEN** `mapAttributes` runs without `onlyTargets`
- **THEN** MappingService SHALL NOT write `CRSID` as an implicit map result

#### Scenario: Explicit map wins over definition-owned exclusion

- **GIVEN** `normalAttributeDefinitions` contains a definition named `COLLEGE_NAME`
- **AND** an attribute map whose `newAttribute` is `COLLEGE_NAME`
- **AND** a live snapshot has `COLLEGE_NAME` `"St John's College"`
- **WHEN** `mapAttributes` runs without `onlyTargets`
- **THEN** `COLLEGE_NAME` SHALL be `"St John's College"`

#### Scenario: Removing a definition row lets its leftover value clear

- **GIVEN** the persisted bag has `STAFF_URL` with a value
- **AND** `normalAttributeDefinitions` no longer contains a definition named `STAFF_URL`
- **AND** no live snapshot has `STAFF_URL`
- **AND** there is no attribute map for `STAFF_URL`
- **WHEN** `mapAttributes` runs without `onlyTargets`
- **THEN** `STAFF_URL` SHALL be absent from `attributeBag.current`

---

## MODIFIED Requirements

### Requirement: MappingService configuration is derived from attributeMaps

MappingService SHALL derive explicit mapping configuration from the user-configured attributeMaps array and defaultAttributeMerge policy. Explicit mapping targets SHALL be every `attributeMaps.newAttribute`. On a full map, MappingService SHALL also evaluate implicit candidates as defined in “MappingService merges unmapped snapshot keys with the default merge” and “MappingService clears vanished snapshot keys”. MappingService SHALL NOT include Fusion schema attributes as mapping targets solely because they appear on the schema.

#### Scenario: Explicit maps remain mapping targets

- **WHEN** MappingService builds its mapping configuration
- **THEN** every attribute named in `attributeMaps.newAttribute` SHALL be an explicit mapping target

#### Scenario: Schema attributes are included as mapping targets
- **WHEN** MappingService builds its mapping configuration
- **THEN** every attribute named in `attributeMaps.newAttribute` SHALL be a mapping target
- **AND** Fusion schema attributes SHALL NOT be mapping targets solely because they appear on the schema

#### Scenario: Schema attributes without a snapshot key are not implicit targets

- **GIVEN** a Fusion schema attribute that is not in `attributeMaps`, does not appear on any live snapshot this invocation, and is not present in `attributeBag.current`
- **WHEN** MappingService builds implicit mapping targets
- **THEN** that schema attribute SHALL NOT be a mapping target

### Requirement: MappingService merges unmapped snapshot keys with the default merge

On a full `mapAttributes` invocation (`onlyTargets` omitted), after explicit mapping targets are processed, MappingService SHALL also merge implicit candidates: **unmapped snapshot keys**, being attribute names that appear on at least one live snapshot in `sourceAttributeMap` this invocation, together with attribute names present in `attributeBag.current`, that are not `attributeMaps[].newAttribute` targets, that are not definition-owned names, and that are not on the denylist (Fusion control attributes, Fusion identity/display `id` and `name`, snapshot overlay fields `source`, `schema`, and `IIQDisabled`). Each implicit candidate SHALL use the global `attributeMerge` default and same-name lookup through `processAttributeMapping`. Empty results SHALL follow the same write, delete, and identity-bag fallback path as explicit maps. MappingService SHALL NOT treat Fusion schema names that appear neither on this invocation’s snapshots nor in `attributeBag.current` as mapping targets.

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
- **AND** `cloudLifecycleState` is not present in `attributeBag.current`
- **AND** there is no attribute map for `cloudLifecycleState`
- **WHEN** `mapAttributes` runs without `onlyTargets`
- **THEN** MappingService SHALL NOT evaluate `cloudLifecycleState` as a mapping target

### Requirement: MappingService supports selective target mapping

MappingService SHALL accept an optional `onlyTargets` parameter on `mapAttributes`. When provided, MappingService SHALL evaluate attribute mappings only for target names in that set (plus system-required side effects for `mainAccount` and `history` when those targets are included) and SHALL NOT merge or clear additional implicit candidates. When omitted, MappingService SHALL process explicit mapping targets and then implicit candidates.

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
