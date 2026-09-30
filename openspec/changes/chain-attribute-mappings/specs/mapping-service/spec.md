## ADDED Requirements

### Requirement: Explicit attribute maps read prior mapped values in configured order

MappingService SHALL evaluate explicit attribute maps in `attributeMaps` order during one `mapAttributes` invocation. A duplicate `newAttribute` SHALL keep the first row. When an explicit map produces a value, that value SHALL be a **prior mapped value** for later explicit maps in that same invocation, addressed by the map's new attribute name. An empty result and designated snapshot unavailable SHALL NOT be prior mapped values.

When a lookup name has a prior mapped value, MappingService SHALL use that value for that name and SHALL NOT read live snapshots for that name. MappingService SHALL NOT change account-major snapshot walk order for names without a prior mapped value. A map SHALL NOT see an explicit map that appears later in `attributeMaps`.

First found, Source name, list, concatenate, Main account, and Origin account merges SHALL honor a prior mapped value. Source filtering SHALL apply to live snapshots and SHALL NOT hide a prior mapped value. List and concatenate SHALL include a prior mapped value once for that name and SHALL NOT also collect snapshot values for that name.

`onlyTargets` SHALL still evaluate only the requested explicit maps, in configured order. A requested map SHALL see prior mapped values only from earlier maps evaluated in that invocation. Implicit candidates SHALL NOT read prior mapped values. Prior mapped values SHALL exist only for that invocation and SHALL NOT be MappingService instance state. MappingService SHALL NOT clone live snapshots or rebuild the snapshot-key index in order to expose them.

#### Scenario: Later map reads an earlier new attribute

- **GIVEN** an earlier explicit map writes `NHI Admin` as `"Cole Aaronson"` from `adminDisplayName`
- **AND** a later explicit map named `Owner` uses First found and looks up `NHI Admin` then `Identity Display Name`
- **AND** no live snapshot has `NHI Admin`
- **WHEN** `mapAttributes` runs
- **THEN** `Owner` SHALL be `"Cole Aaronson"`

#### Scenario: Missing earlier value falls through to the snapshot

- **GIVEN** an earlier explicit map named `NHI Admin` produces no value
- **AND** a later map looks up `NHI Admin` then `displayName`
- **AND** a live snapshot has `displayName` `"NHI nhi.cole"`
- **WHEN** `mapAttributes` runs
- **THEN** the later map SHALL use `"NHI nhi.cole"`

#### Scenario: A map does not see a later map

- **GIVEN** the first explicit map looks up `Owner`
- **AND** a later explicit map writes `Owner`
- **AND** no earlier map has written `Owner`
- **AND** no live snapshot has `Owner`
- **WHEN** `mapAttributes` runs
- **THEN** the first map SHALL NOT use the later map's `Owner` value

#### Scenario: Prior mapped value wins over the same snapshot name

- **GIVEN** an earlier explicit map writes `displayName` as `"Cole Aaronson"`
- **AND** a later map looks up `displayName`
- **AND** a live snapshot has `displayName` `"NHI nhi.cole"`
- **WHEN** `mapAttributes` runs
- **THEN** the later map SHALL use `"Cole Aaronson"`

#### Scenario: Source merge still uses a prior mapped value

- **GIVEN** an earlier explicit map writes `NHI Admin` as `"Cole Aaronson"`
- **AND** a later map uses Source name merge for a source that has no `NHI Admin` snapshot attribute
- **AND** that map looks up `NHI Admin`
- **WHEN** `mapAttributes` runs
- **THEN** the later map SHALL use `"Cole Aaronson"`

#### Scenario: List includes a prior mapped value once

- **GIVEN** an earlier explicit map writes `title` as `"Nursing Roster Service"`
- **AND** a later map uses list merge and looks up `title`
- **AND** a live snapshot also has `title` `"Other"`
- **WHEN** `mapAttributes` runs
- **THEN** the later map's list SHALL contain `"Nursing Roster Service"` once
- **AND** the list SHALL NOT contain `"Other"`

#### Scenario: Main account merge uses a prior mapped value missing from the designated snapshot

- **GIVEN** an earlier explicit map writes `NHI Admin` as `"Cole Aaronson"`
- **AND** a later map uses Main account merge and looks up `NHI Admin`
- **AND** the designated snapshot is present and has no `NHI Admin`
- **WHEN** `mapAttributes` runs
- **THEN** the later map SHALL use `"Cole Aaronson"`

#### Scenario: Origin account merge uses a prior mapped value when the origin snapshot is unavailable

- **GIVEN** an earlier explicit map writes `NHI Admin` as `"Cole Aaronson"`
- **AND** a later map uses Origin account merge and looks up `NHI Admin`
- **AND** the origin snapshot is not present in this invocation
- **WHEN** `mapAttributes` runs
- **THEN** the later map SHALL use `"Cole Aaronson"`
- **AND** the persisted bag value for that later attribute SHALL NOT be preserved in place of `"Cole Aaronson"`

#### Scenario: Selective map does not evaluate an unrequested predecessor

- **GIVEN** an earlier explicit map named `NHI Admin` from `adminDisplayName` `"Cole Aaronson"`
- **AND** a later explicit map named `Owner` looks up `NHI Admin`
- **AND** `onlyTargets` contains `Owner` and does not contain `NHI Admin`
- **WHEN** `mapAttributes` runs
- **THEN** `NHI Admin` SHALL NOT be evaluated
- **AND** `Owner` SHALL NOT be `"Cole Aaronson"` from that unevaluated map

#### Scenario: Implicit candidate does not read a prior mapped value

- **GIVEN** an explicit map writes `alias` as `"Cole Aaronson"`
- **AND** `department` is not an explicit map target
- **AND** a live snapshot has `department` `"Production"`
- **WHEN** a full `mapAttributes` runs
- **THEN** `department` SHALL be `"Production"`
- **AND** `department` SHALL NOT be taken from a prior mapped value

#### Scenario: First found snapshot order stays account-major

- **GIVEN** one explicit map looks up `mail` then `email`
- **AND** neither name has a prior mapped value
- **AND** the first source account has `mail` `"first@example.com"` and no `email`
- **AND** a later source account has `email` `"later@example.com"`
- **WHEN** `mapAttributes` runs with First found merge
- **THEN** the mapped value SHALL be `"first@example.com"`

#### Scenario: Prior mapped values do not leak across invocations

- **GIVEN** one `mapAttributes` invocation writes a prior mapped value for `NHI Admin`
- **WHEN** a later invocation maps an account that does not write `NHI Admin`
- **THEN** that later invocation SHALL NOT see the earlier invocation's prior mapped value

---

## MODIFIED Requirements

### Requirement: MappingService merges managed source attributes into Fusion accounts

The MappingService SHALL provide attribute consolidation from managed source accounts into the Fusion account schema. It SHALL apply configurable merge strategies (first-found, source-specific, concatenate, distinct-list, Main account, Origin account) in the ordered sequence defined by the source configuration, except that Main account and Origin account strategies read a single account snapshot and do not walk source order. A lookup name with a prior mapped value SHALL use that value and SHALL NOT use a live snapshot value for that name.

#### Scenario: Attribute merged with first-found strategy
- **WHEN** MappingService.mapAttributes is called with a FusionAccount and configured source order
- **AND** no lookup name has a prior mapped value
- **THEN** for each mapped attribute, the first non-empty value across sources in order SHALL be selected
- **AND** the result SHALL be written to fusionAccount.attributeBag.current

#### Scenario: Attribute merged with source-specific strategy
- **WHEN** an attribute map specifies a source name and merge strategy is "source"
- **AND** no lookup name has a prior mapped value
- **THEN** only accounts from the specified source SHALL be consulted
- **AND** the first match within that source SHALL be used

#### Scenario: Identity-type accounts skip mapping
- **WHEN** a FusionAccount has type FusionAccountKind.Identity
- **THEN** mapAttributes SHALL return immediately without modifying the attribute bag

### Requirement: MappingService preserves current when the designated snapshot is unavailable

When the merge strategy is Main account or Origin account, MappingService SHALL distinguish **designated snapshot unavailable** from **snapshot present but attribute empty**. If the designated snapshot key is not present in this invocation’s source attribute map / snapshot index at all, MappingService SHALL treat the merge as no-opinion and SHALL preserve the existing `attributeBag.current` value for that attribute (explicit map or implicit candidate under those strategies). If the designated snapshot object is present and has no value for the mapped attributes, MappingService SHALL treat the result as empty and follow the existing delete / identity-bag / definition-owned / no-managed-context rules. Sibling snapshots SHALL NOT supply Main account or Origin account values. A lookup name with a prior mapped value SHALL use that prior mapped value instead of preserving or clearing the attribute for lack of a snapshot value.

#### Scenario: Unavailable origin snapshot preserves firstname under Main account merge

- **GIVEN** global or per-map merge is Main account
- **AND** a Fusion account whose persisted bag has `firstname` `"Nadya"`
- **AND** neither the `mainAccount` snapshot nor the origin snapshot is present in `sourceAttributeMap`
- **AND** another live sibling snapshot exists with `givenName` `"Nadia"`
- **AND** the mapping for `firstname` looks up `givenName` with Main account merge
- **AND** `givenName` has no prior mapped value
- **WHEN** `mapAttributes` runs
- **THEN** `firstname` SHALL still be `"Nadya"`
- **AND** `firstname` SHALL NOT be taken from the sibling snapshot

#### Scenario: Present origin snapshot without the attribute still clears

- **GIVEN** Main account merge for `firstname` looking up `givenName`
- **AND** the origin snapshot is present in `sourceAttributeMap` but has no `givenName`
- **AND** the persisted bag has `firstname` `"Nadya"`
- **AND** a sibling snapshot has `givenName` `"Nadia"`
- **AND** `givenName` has no prior mapped value
- **WHEN** `mapAttributes` runs
- **THEN** `firstname` SHALL be absent from `attributeBag.current`

#### Scenario: Unavailable designated snapshot under Origin account merge preserves current

- **GIVEN** Origin account merge for `department`
- **AND** the persisted bag has `department` `"Human Resources"`
- **AND** the origin snapshot is not present in `sourceAttributeMap`
- **AND** another live snapshot has `department` `"Finance"`
- **AND** `department` has no prior mapped value
- **WHEN** `mapAttributes` runs
- **THEN** `department` SHALL still be `"Human Resources"`

### Requirement: MappingService applies Main account merge without fallback

When the merge strategy is Main account (`mainAccount`), MappingService SHALL read mapped attribute values from a single snapshot: the `mainAccount` managed account when that key is present and found in the source attribute map this run, otherwise the origin snapshot. MappingService SHALL NOT consult other sources or sibling accounts on the same source. If the chosen snapshot object is present and has no value for the mapped attributes, MappingService SHALL treat the result as empty (undefined). If the chosen snapshot is **designated snapshot unavailable** (not present in the source attribute map / snapshot index at all), MappingService SHALL NOT treat the result as empty for delete purposes; it SHALL preserve `attributeBag.current` for that attribute. A lookup name with a prior mapped value SHALL use that value and SHALL NOT fall through to another snapshot or to preservation for that name.

#### Scenario: Main account merge uses mainAccount snapshot when found
- **GIVEN** a Fusion account whose origin snapshot has `jobTitle` `"Engineer"`
- **AND** `mainAccount` identifies a managed account that has `jobTitle` `"Manager"`
- **AND** the mapping for `jobTitle` uses Main account merge
- **AND** `jobTitle` has no prior mapped value
- **WHEN** `mapAttributes` runs
- **THEN** `jobTitle` SHALL be `"Manager"`

#### Scenario: Main account merge falls back to origin snapshot when mainAccount is unset
- **GIVEN** a Fusion account with no valid `mainAccount`
- **AND** the origin snapshot has `jobTitle` `"Engineer"`
- **AND** another source account has `jobTitle` `"Manager"`
- **AND** the mapping for `jobTitle` uses Main account merge
- **AND** `jobTitle` has no prior mapped value
- **WHEN** `mapAttributes` runs
- **THEN** `jobTitle` SHALL be `"Engineer"`

#### Scenario: Main account merge does not fall through when the chosen snapshot lacks the attribute
- **GIVEN** a Fusion account whose `mainAccount` snapshot has no `jobTitle`
- **AND** another source account has `jobTitle` `"Manager"`
- **AND** the mapping for `jobTitle` uses Main account merge
- **AND** `jobTitle` has no prior mapped value
- **WHEN** `mapAttributes` runs
- **THEN** `jobTitle` SHALL NOT be taken from the other source account

#### Scenario: Main account merge preserves current when designated snapshot is unavailable
- **GIVEN** a Fusion account whose persisted bag has `jobTitle` `"Engineer"`
- **AND** neither the `mainAccount` snapshot nor the origin snapshot is present this invocation
- **AND** another live snapshot has `jobTitle` `"Manager"`
- **AND** the mapping for `jobTitle` uses Main account merge
- **AND** `jobTitle` has no prior mapped value
- **WHEN** `mapAttributes` runs
- **THEN** `jobTitle` SHALL still be `"Engineer"`

### Requirement: MappingService applies Origin account merge without fallback

When the merge strategy is Origin account (`originAccount`), MappingService SHALL read mapped attribute values from the origin snapshot only and SHALL ignore `mainAccount`. MappingService SHALL NOT consult other sources or sibling accounts. If the origin snapshot object is present and has no value for the mapped attributes, MappingService SHALL treat the result as empty (undefined). If the origin snapshot is **designated snapshot unavailable**, MappingService SHALL preserve `attributeBag.current` for that attribute rather than deleting it. A lookup name with a prior mapped value SHALL use that value and SHALL NOT fall through to another snapshot or to preservation for that name.

#### Scenario: Origin account merge ignores mainAccount
- **GIVEN** a Fusion account whose origin snapshot has `jobTitle` `"Engineer"`
- **AND** `mainAccount` identifies a managed account that has `jobTitle` `"Manager"`
- **AND** the mapping for `jobTitle` uses Origin account merge
- **AND** `jobTitle` has no prior mapped value
- **WHEN** `mapAttributes` runs
- **THEN** `jobTitle` SHALL be `"Engineer"`

#### Scenario: Origin account merge uses the Identities identity bag for identity-origin Fusion accounts
- **GIVEN** an identity-origin Fusion account (`originSource` is Identities)
- **AND** the identity bag has `department` `"HR"`
- **AND** a linked managed account has `department` `"IT"`
- **AND** `mainAccount` is unset
- **AND** the mapping for `department` uses Origin account merge
- **AND** `department` has no prior mapped value
- **WHEN** `mapAttributes` runs
- **THEN** `department` SHALL be `"HR"`

#### Scenario: Origin account merge pins the origin account key not the first account on originSource
- **GIVEN** two managed accounts from the origin source on the Fusion account
- **AND** `originAccount` identifies the second of those accounts
- **AND** only the origin account has `email` `"origin@acme.com"`
- **AND** the mapping for `email` uses Origin account merge
- **AND** `email` has no prior mapped value
- **WHEN** `mapAttributes` runs
- **THEN** `email` SHALL be `"origin@acme.com"`

#### Scenario: Origin account merge preserves current when origin snapshot is unavailable
- **GIVEN** a Fusion account whose persisted bag has `email` `"kept@acme.com"`
- **AND** the origin snapshot is not present this invocation
- **AND** another live snapshot has `email` `"other@acme.com"`
- **AND** the mapping for `email` uses Origin account merge
- **AND** `email` has no prior mapped value
- **WHEN** `mapAttributes` runs
- **THEN** `email` SHALL still be `"kept@acme.com"`

---

## REMOVED Requirements

---

## RENAMED Requirements
