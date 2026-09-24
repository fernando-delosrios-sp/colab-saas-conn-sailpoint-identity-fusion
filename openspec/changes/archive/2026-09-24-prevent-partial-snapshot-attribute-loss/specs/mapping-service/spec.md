## ADDED Requirements

### Requirement: MappingService preserves current when the designated snapshot is unavailable

When the merge strategy is Main account or Origin account, MappingService SHALL distinguish **designated snapshot unavailable** from **snapshot present but attribute empty**. If the designated snapshot key is not present in this invocation’s source attribute map / snapshot index at all, MappingService SHALL treat the merge as no-opinion and SHALL preserve the existing `attributeBag.current` value for that attribute (explicit map or implicit candidate under those strategies). If the designated snapshot object is present and has no value for the mapped attributes, MappingService SHALL treat the result as empty and follow the existing delete / identity-bag / definition-owned / no-managed-context rules. Sibling snapshots SHALL NOT supply Main account or Origin account values.

#### Scenario: Unavailable origin snapshot preserves firstname under Main account merge

- **GIVEN** global or per-map merge is Main account
- **AND** a Fusion account whose persisted bag has `firstname` `"Nadya"`
- **AND** neither the `mainAccount` snapshot nor the origin snapshot is present in `sourceAttributeMap`
- **AND** another live sibling snapshot exists with `givenName` `"Nadia"`
- **AND** the mapping for `firstname` looks up `givenName` with Main account merge
- **WHEN** `mapAttributes` runs
- **THEN** `firstname` SHALL still be `"Nadya"`
- **AND** `firstname` SHALL NOT be taken from the sibling snapshot

#### Scenario: Present origin snapshot without the attribute still clears

- **GIVEN** Main account merge for `firstname` looking up `givenName`
- **AND** the origin snapshot is present in `sourceAttributeMap` but has no `givenName`
- **AND** the persisted bag has `firstname` `"Nadya"`
- **AND** a sibling snapshot has `givenName` `"Nadia"`
- **WHEN** `mapAttributes` runs
- **THEN** `firstname` SHALL be absent from `attributeBag.current`

#### Scenario: Unavailable designated snapshot under Origin account merge preserves current

- **GIVEN** Origin account merge for `department`
- **AND** the persisted bag has `department` `"Human Resources"`
- **AND** the origin snapshot is not present in `sourceAttributeMap`
- **AND** another live snapshot has `department` `"Finance"`
- **WHEN** `mapAttributes` runs
- **THEN** `department` SHALL still be `"Human Resources"`

---

## MODIFIED Requirements

### Requirement: MappingService applies Main account merge without fallback

When the merge strategy is Main account (`mainAccount`), MappingService SHALL read mapped attribute values from a single snapshot: the `mainAccount` managed account when that key is present and found in the source attribute map this run, otherwise the origin snapshot. MappingService SHALL NOT consult other sources or sibling accounts on the same source. If the chosen snapshot object is present and has no value for the mapped attributes, MappingService SHALL treat the result as empty (undefined). If the chosen snapshot is **designated snapshot unavailable** (not present in the source attribute map / snapshot index at all), MappingService SHALL NOT treat the result as empty for delete purposes; it SHALL preserve `attributeBag.current` for that attribute.

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

#### Scenario: Main account merge preserves current when designated snapshot is unavailable
- **GIVEN** a Fusion account whose persisted bag has `jobTitle` `"Engineer"`
- **AND** neither the `mainAccount` snapshot nor the origin snapshot is present this invocation
- **AND** another live snapshot has `jobTitle` `"Manager"`
- **AND** the mapping for `jobTitle` uses Main account merge
- **WHEN** `mapAttributes` runs
- **THEN** `jobTitle` SHALL still be `"Engineer"`

### Requirement: MappingService applies Origin account merge without fallback

When the merge strategy is Origin account (`originAccount`), MappingService SHALL read mapped attribute values from the origin snapshot only and SHALL ignore `mainAccount`. MappingService SHALL NOT consult other sources or sibling accounts. If the origin snapshot object is present and has no value for the mapped attributes, MappingService SHALL treat the result as empty (undefined). If the origin snapshot is **designated snapshot unavailable**, MappingService SHALL preserve `attributeBag.current` for that attribute rather than deleting it.

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

#### Scenario: Origin account merge preserves current when origin snapshot is unavailable
- **GIVEN** a Fusion account whose persisted bag has `email` `"kept@acme.com"`
- **AND** the origin snapshot is not present this invocation
- **AND** another live snapshot has `email` `"other@acme.com"`
- **AND** the mapping for `email` uses Origin account merge
- **WHEN** `mapAttributes` runs
- **THEN** `email` SHALL still be `"kept@acme.com"`

### Requirement: MappingService clears vanished snapshot keys

On a full `mapAttributes` invocation (`onlyTargets` omitted), MappingService SHALL treat attribute names present in `attributeBag.current` as implicit candidates alongside live-snapshot keys. A **vanished snapshot key** — a candidate that no live snapshot in `sourceAttributeMap` carries this invocation — SHALL resolve through `processAttributeMapping` and SHALL be deleted from `attributeBag.current` when that resolution is empty, following the same delete and identity-bag fallback path as an explicit map whose merge yields empty — **except** when the candidate is evaluated under Main account or Origin account merge and the designated snapshot is unavailable, in which case MappingService SHALL preserve the current value. When the designated Main/Origin snapshot **was** fetched and lacks the attribute, clearing SHALL still occur.

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
- **THEN** `title` SHALL still be `"Reader"`
- **AND** MappingService SHALL treat this as designated snapshot unavailable rather than a vanished-key clear

#### Scenario: Designated snapshot present without the attribute clears

- **GIVEN** global `attributeMerge` is Main account
- **AND** a Fusion account whose persisted bag has `title` `"Reader"`
- **AND** the origin snapshot was fetched this invocation and has no `title`
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
