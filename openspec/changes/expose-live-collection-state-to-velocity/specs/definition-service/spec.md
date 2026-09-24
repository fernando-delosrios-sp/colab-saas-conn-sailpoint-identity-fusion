## ADDED Requirements

### Requirement: Define exposes live collection state to Velocity templates

`buildVelocityContext` SHALL expose the Fusion account's live collection state to Velocity templates as own context properties `statuses`, `actions`, and `reviews`, each a string array read from `FusionCollections` when the context is built. These keys SHALL reflect what the current aggregation has decided for the account, including state applied after the account was created in the same run. Define SHALL NOT write collection state into `fusionAccount.attributes`; `syncCollectionAttributesToBag` remains the only writer of collection state into the attribute bag. `previous` SHALL continue to expose `attributeBag.previous`, so the persisted collection snapshot from the prior aggregation stays reachable through `$previous`.

#### Scenario: Unique definition reads a status applied during the current run
- **GIVEN** an identity-origin Fusion account created during this aggregation with no persisted `statuses` attribute
- **AND** the `reviewer` status was added to the account after creation
- **AND** a Unique definition for the Fusion identity attribute whose expression emits `$UUID` only when `statuses` contains `reviewer`
- **WHEN** `refreshUniqueAttributes` runs
- **THEN** the Fusion identity attribute SHALL be a generated UUID

#### Scenario: Unique definition renders empty for an account without the status
- **GIVEN** an identity-origin Fusion account created during this aggregation without the `reviewer` status
- **AND** `skipAccountsWithMissingId` is `true`
- **AND** a Unique definition for the Fusion identity attribute whose expression emits `$UUID` only when `statuses` contains `reviewer`
- **WHEN** `refreshUniqueAttributes` runs
- **THEN** the Fusion identity attribute SHALL remain unset

#### Scenario: Reset regenerates a unique value from live collection state
- **GIVEN** a persisted Fusion account carrying the `reviewer` status that is being reset
- **AND** a Unique definition for the Fusion identity attribute gated on `statuses` containing `reviewer`
- **WHEN** `refreshUniqueAttributes` runs
- **THEN** the Fusion identity attribute SHALL be a newly generated value rather than empty

#### Scenario: Reviews with no pending forms render as an empty list
- **GIVEN** a Fusion account whose reviews collection is empty and which has no persisted `reviews` attribute
- **AND** a Normal definition expression reporting `$reviews.size()`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the defined attribute SHALL be `"0"`

#### Scenario: Define does not persist collection state into the attribute bag
- **GIVEN** a Fusion account whose live statuses include `reviewer` and whose attribute bag has no `statuses` attribute
- **WHEN** `refreshNormalAttributes` and `refreshUniqueAttributes` run
- **THEN** `fusionAccount.attributes` SHALL still have no `statuses` attribute

#### Scenario: Previous attributes still expose the prior collection snapshot
- **GIVEN** a persisted Fusion account whose `attributeBag.previous` carries `statuses` `["baseline"]`
- **AND** the current run has added the `reviewer` status to the account
- **AND** a Normal definition expression reporting `$previous.statuses.size()`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the defined attribute SHALL be `"1"`

### Requirement: Reviewer status reaches Normal definitions only after reviewer registration

Reviewer state applied from a persisted `reviewer:<sourceId>` action SHALL be live in the Velocity context for Normal definitions, because reviewer layers are applied before attribute processing when a persisted Fusion account is processed. For a Fusion account created from an identity during the same aggregation, global reviewer registration happens after that account's Normal definitions have run, so Normal definitions SHALL NOT be required to observe the `reviewer` status on the run the account is created. Unique definitions SHALL observe it, because they evaluate during output after reviewer registration.

#### Scenario: Normal definition sees a persisted reviewer action
- **GIVEN** a persisted Fusion account carrying a `reviewer:<sourceId>` action
- **AND** a Normal definition expression that reports whether `actions` contains that reviewer action
- **WHEN** the account is processed and `refreshNormalAttributes` runs
- **THEN** the defined attribute SHALL report the reviewer action as present

#### Scenario: Normal definition does not see global reviewer status on the creating run
- **GIVEN** an identity whose Fusion account is created during this aggregation and who is a global reviewer
- **AND** a Normal definition expression that reports whether `statuses` contains `reviewer`
- **WHEN** the identity is processed and `refreshNormalAttributes` runs
- **THEN** the defined attribute SHALL report the `reviewer` status as absent
- **AND** a Unique definition evaluated for the same account during output SHALL report it as present

---

## MODIFIED Requirements

### Requirement: DefinitionService Velocity caller context does not clone the current bag

`buildVelocityContext` SHALL expose current Fusion account attributes to templates without shallow-copying `attributeBag.current` into a new object that holds those attributes as own properties. Special keys (`identity`, `accounts`, `previous`, `sources`, `account`, `originSource`, `originAccount`, `statuses`, `actions`, `reviews`) SHALL remain own properties on the context object so they override any same-named current attributes, matching pre-change spread-then-assign behavior. Sequential Normal definition writes SHALL still update `fusionAccount.attributes` and the evaluation context for later definitions.

#### Scenario: Later Normal definition sees an earlier write
- **GIVEN** Normal definitions `first` then `full` where `full`’s expression is `"$first"`
- **AND** `first` evaluates to `"Ada"`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** `full` SHALL be `"Ada"`

#### Scenario: Special context keys override current bag names
- **GIVEN** `attributeBag.current.identity` is the string `"not-the-identity-object"`
- **AND** the Fusion account has an identity bag with `name` `"Jane"`
- **AND** a Normal definition expression `"$identity.name"`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the defined attribute SHALL be `"Jane"`

#### Scenario: Live collection keys override the persisted collection snapshot
- **GIVEN** `attributeBag.current.statuses` is `["baseline"]` from the prior aggregation
- **AND** the current run has added the `reviewer` status to the account
- **AND** a Normal definition expression reporting `$statuses.size()`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the defined attribute SHALL be `"2"`

#### Scenario: Normal definition named after a live collection key wins for later definitions
- **GIVEN** Normal definitions `statuses` then `copy` where `copy`’s expression is `"$statuses"`
- **AND** `statuses` evaluates to `"custom"`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** `copy` SHALL be `"custom"`

#### Scenario: Render context remains null-prototype at evaluateVelocityTemplate
- **GIVEN** any Normal definition evaluation
- **WHEN** `evaluateVelocityTemplate` builds the render context
- **THEN** `Object.getPrototypeOf(renderContext)` SHALL still be `null`
- **AND** helper keys SHALL still override caller context keys

#### Scenario: Inherited current-bag attributes are visible to templates
- **GIVEN** a Velocity caller context whose prototype is `attributeBag.current`
- **AND** `attributeBag.current` has `firstname` `"Ada"` and `lastname` `"Lovelace"` as own properties
- **AND** a Normal definition expression `"${firstname} ${lastname}"`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the defined attribute SHALL be `"Ada Lovelace"`
- **AND** own caller-context keys SHALL still override same-named inherited current-bag keys
