## ADDED Requirements

_(none)_

---

## MODIFIED Requirements

### Requirement: MappingService merges unmapped snapshot keys with the default merge

On a full `mapAttributes` invocation (`onlyTargets` omitted), after explicit mapping targets are processed, MappingService SHALL also merge implicit candidates: **unmapped snapshot keys**, being attribute names that appear on at least one live snapshot in `sourceAttributeMap` this invocation, together with attribute names present in `attributeBag.current`, that are not `attributeMaps[].newAttribute` targets, that are not Unique definition names, and that are not on the denylist (Fusion control attributes, Fusion identity/display `id` and `name`, snapshot overlay fields `source`, `schema`, and `IIQDisabled`). Each implicit candidate SHALL use the global `attributeMerge` default and same-name lookup through `processAttributeMapping`. Empty results SHALL follow the same write, delete, and identity-bag fallback path as explicit maps, except that a definition-owned name SHALL NOT be deleted. MappingService SHALL NOT treat Fusion schema names that appear neither on this invocation’s snapshots nor in `attributeBag.current` as mapping targets.

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

### Requirement: MappingService treats definition-owned names by definition kind

MappingService SHALL treat **definition-owned names** by definition kind on a full `mapAttributes` invocation (`onlyTargets` omitted). Unique definition names SHALL be excluded from implicit candidate collection, so Map neither merges nor clears them as implicit candidates. A Normal definition name SHALL be an ordinary implicit candidate: when a live snapshot carries it, Map SHALL merge it under the global `attributeMerge` default; when `processAttributeMapping` yields empty, Map SHALL preserve the existing `attributeBag.current` value instead of deleting it. Empty merge SHALL also preserve a Unique definition name that reaches `applyMappedValue` through an explicit `attributeMaps[].newAttribute` target. Explicit mapping rows SHALL still write when they yield a value. Exclusion and delete suppression SHALL follow the definition lists configured for the current invocation, so a name whose definition row has been removed SHALL become an ordinary implicit candidate, including vanished-key clearing.

#### Scenario: Unique definition value is preserved

- **GIVEN** `uniqueAttributeDefinitions` contains a definition named `UID`
- **AND** the persisted bag has `UID` `"WD000015"`
- **AND** no live snapshot has `UID`
- **WHEN** `mapAttributes` runs without `onlyTargets`
- **THEN** `UID` SHALL still be `"WD000015"`

#### Scenario: Definition-owned name on a snapshot is not merged by Map

- **GIVEN** `uniqueAttributeDefinitions` contains a definition named `UID`
- **AND** the persisted bag has `UID` `"WD000015"`
- **AND** a live snapshot has `UID` `"from-source"`
- **AND** there is no attribute map whose `newAttribute` is `UID`
- **WHEN** `mapAttributes` runs without `onlyTargets`
- **THEN** `UID` SHALL still be `"WD000015"`

#### Scenario: Normal definition output is left to Define

- **GIVEN** `normalAttributeDefinitions` contains a definition named `STUDENT_URL`
- **AND** the persisted bag has `STUDENT_URL` with a value
- **AND** no live snapshot has `STUDENT_URL`
- **WHEN** `mapAttributes` runs without `onlyTargets`
- **THEN** MappingService SHALL NOT delete `STUDENT_URL`

#### Scenario: Normal definition name on a snapshot is merged by Map

- **GIVEN** `normalAttributeDefinitions` contains a definition named `CRSID`
- **AND** a live snapshot has `CRSID` `"sailpoint-AH2543"`
- **AND** there is no attribute map whose `newAttribute` is `CRSID`
- **AND** global `attributeMerge` is Main account
- **WHEN** `mapAttributes` runs without `onlyTargets`
- **THEN** `CRSID` SHALL be `"sailpoint-AH2543"`

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

#### Scenario: Selective mapping does not merge a Normal definition name

- **GIVEN** `normalAttributeDefinitions` contains a definition named `CRSID`
- **AND** a live snapshot has `CRSID` `"sailpoint-AH2543"`
- **AND** `onlyTargets` is `Set(['employeeId'])`
- **WHEN** `mapAttributes` runs
- **THEN** MappingService SHALL NOT write `CRSID` as an implicit map result

---

## REMOVED Requirements

_(none)_

---

## RENAMED Requirements

- FROM: `### Requirement: MappingService excludes definition-owned names from implicit candidates`
- TO: `### Requirement: MappingService treats definition-owned names by definition kind`
