## ADDED Requirements

_(none)_

---

## MODIFIED Requirements

### Requirement: Disabled identity scope excludes identity data from Define

When `includeIdentities` is `false`, DefinitionService SHALL NOT expose the identity bag, identity alias, or an Identities origin snapshot from managed-origin Fusion accounts through the Velocity context. Managed account snapshots and current mapped attributes SHALL remain available. Identity-origin Fusion accounts explicitly created for required support identities, such as global reviewers, SHALL retain their own identity context.

The display attribute override SHALL still apply to managed-origin Fusion accounts with a correlated managed origin (originating managed source account `uncorrelated === false`) when `includeIdentities` is `false`: `fusionDisplayAttribute` SHALL be the identity alias in preference to Normal or Unique definition output. Uncorrelated managed-origin Fusion accounts SHALL keep display values from mapping and definitions. When the override is eligible but no identity alias resolves, DefinitionService SHALL NOT blank the attribute; evaluation SHALL fall through to definition output and then to the existing core-schema safe default.

#### Scenario: Normal definition cannot read identity attributes when identity scope is disabled
- **GIVEN** `includeIdentities` is `false`
- **AND** a managed-origin Fusion account has an identity bag with `department` `"Identity HR"`
- **AND** a Normal definition expression `"$!identity.department"`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the defined attribute SHALL be absent

#### Scenario: Identities origin snapshot stays excluded from Velocity when identity scope is disabled
- **GIVEN** `includeIdentities` is `false`
- **AND** a managed-origin Fusion account has an `Identities` origin snapshot
- **AND** a Normal definition that reads that snapshot through `$sources`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the defined attribute SHALL NOT take a value from the `Identities` origin snapshot

#### Scenario: Identity alias is not a Velocity value for managed-origin accounts when identity scope is disabled
- **GIVEN** `includeIdentities` is `false`
- **AND** a managed-origin Fusion account has a resolvable identity alias
- **AND** a Normal definition expression that reads the identity alias from the identity context
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the defined attribute SHALL NOT equal that identity alias solely because identity context exposed it

#### Scenario: Alias overrides a Unique display definition when identity scope is disabled
- **GIVEN** `includeIdentities` is `false`
- **AND** a new managed-origin Fusion account whose originating managed source account has `uncorrelated === false`
- **AND** an identity layer supplies identity alias `"aanderson"`
- **AND** a Unique definition for `fusionDisplayAttribute` that evaluates to `"generated-display"`
- **WHEN** `refreshUniqueAttributes` runs
- **THEN** `fusionDisplayAttribute` SHALL be `"aanderson"`

#### Scenario: Alias overrides a Normal display definition when identity scope is disabled
- **GIVEN** `includeIdentities` is `false`
- **AND** a new managed-origin Fusion account whose originating managed source account has `uncorrelated === false`
- **AND** an identity layer supplies identity alias `"aanderson"`
- **AND** a Normal definition for `fusionDisplayAttribute` that evaluates to `"Definition Display Name"`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** `fusionDisplayAttribute` SHALL be `"aanderson"`

#### Scenario: Unavailable alias falls through to a non-empty Normal definition
- **GIVEN** `includeIdentities` is `false`
- **AND** a new managed-origin Fusion account whose originating managed source account has `uncorrelated === false`
- **AND** no identity alias resolves
- **AND** a Normal definition for `fusionDisplayAttribute` that evaluates to a non-empty value
- **WHEN** `refreshNormalAttributes` runs
- **THEN** `fusionDisplayAttribute` SHALL be that definition value
- **AND** the attribute SHALL NOT be left empty

#### Scenario: Unavailable alias falls through to the safe default when the Normal definition is empty
- **GIVEN** `includeIdentities` is `false`
- **AND** a new managed-origin Fusion account whose originating managed source account has `uncorrelated === false`
- **AND** no identity alias resolves
- **AND** a Normal definition for `fusionDisplayAttribute` that evaluates to an empty value
- **WHEN** `refreshNormalAttributes` runs
- **THEN** `fusionDisplayAttribute` SHALL be the existing core-schema safe default
- **AND** the attribute SHALL NOT be left empty

#### Scenario: Unavailable alias does not skip Unique display generation
- **GIVEN** `includeIdentities` is `false`
- **AND** a new managed-origin Fusion account whose originating managed source account has `uncorrelated === false`
- **AND** no identity alias resolves
- **AND** a Unique definition for `fusionDisplayAttribute` that evaluates to a non-empty value
- **WHEN** `refreshUniqueAttributes` runs
- **THEN** `fusionDisplayAttribute` SHALL be that generated value

#### Scenario: Uncorrelated managed origin still uses definition output when identity scope is disabled
- **GIVEN** `includeIdentities` is `false`
- **AND** a managed-origin Fusion account whose originating managed source account has `uncorrelated === true`
- **AND** an identity layer is attached
- **AND** a Normal definition for `fusionDisplayAttribute` that evaluates to `"Definition Display Name"`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** `fusionDisplayAttribute` SHALL be `"Definition Display Name"`

#### Scenario: Persisted managed-origin Fusion account stays override-ineligible while identity flag follows identity origin
- **GIVEN** `includeIdentities` is `false`
- **AND** a Fusion account loaded from a persisted Fusion account whose originating managed source account was correlated
- **AND** `isIdentity` is false because the account was not built from an identity origin
- **AND** the display attribute already has a definition-generated value
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the persisted display attribute SHALL remain unchanged

#### Scenario: Identity scope enabled still applies the alias on a correlated managed origin
- **GIVEN** `includeIdentities` is `true`
- **AND** a new managed-origin Fusion account whose originating managed source account has `uncorrelated === false`
- **AND** an identity layer supplies identity alias `"aanderson"`
- **WHEN** the display attribute override runs
- **THEN** `fusionDisplayAttribute` SHALL be `"aanderson"`

#### Scenario: Identity-origin support account retains identity context when identity scope is disabled
- **GIVEN** `includeIdentities` is `false`
- **AND** an identity-origin Fusion account created for a required support identity such as a global reviewer
- **AND** a Normal definition expression `"$!identity.department"`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the defined attribute SHALL take the identity bag value
- **AND** the display attribute override SHALL still use that account’s identity alias

---

## REMOVED Requirements

_(none)_

---

## RENAMED Requirements

_(none)_
