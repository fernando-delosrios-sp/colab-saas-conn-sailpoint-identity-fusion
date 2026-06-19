# fusion-account-attribute-resolution Specification

## Purpose
TBD - created by archiving change enforce-fusion-schema-attributes. Update Purpose after archive.
## Requirements
### Requirement: fusionDisplayAttribute and fusionIdentityAttribute MUST always be present

The attributes referenced by `displayAttribute` and `identityAttribute` in the Fusion account schema MUST never be empty or missing.

Feature: Fusion account attribute resolution
Rule: The attributes referenced by `displayAttribute` and `identityAttribute` in the Fusion account schema must never be empty or missing.

#### Scenario: display attribute falls back to account name when no definition value exists
- **GIVEN** a Fusion account with no value for the display attribute
- **WHEN** the attribute definitions are processed
- **THEN** the display attribute is set to the Fusion account name

#### Scenario: identity attribute falls back to origin account id when no definition value exists
- **GIVEN** a Fusion account with no value for the identity attribute
- **WHEN** the attribute definitions are processed
- **THEN** the identity attribute is set to the account's `originAccountId`

#### Scenario: identity attribute falls back to persisted origin account attribute when originAccountId is missing
- **GIVEN** a Fusion account with no `originAccountId` and no definition value for the identity attribute
- **WHEN** the attribute definitions are processed
- **THEN** the identity attribute is set to the persisted `originAccount` attribute

#### Scenario: identity attribute falls back to generated UUID when no origin value exists
- **GIVEN** a Fusion account with no `originAccountId`, no persisted `originAccount` attribute, and no definition value for the identity attribute
- **WHEN** the attribute definitions are processed
- **THEN** the identity attribute is set to a freshly generated v4 UUID

#### Scenario: identity-origin account gets identity id as identity attribute
- **GIVEN** a new Fusion account is created from an identity
- **WHEN** the identity account is processed
- **THEN** the identity attribute is set to the identity's `id`

#### Scenario: identity-origin account gets identity name as display attribute
- **GIVEN** a new Fusion account is created from an identity
- **WHEN** the identity account is processed
- **THEN** the display attribute is set to the identity's display name, falling back to the identity's `name`

#### Scenario: correlated managed account gets identity name as display attribute
- **GIVEN** a managed account that has been correlated to an identity
- **WHEN** the Fusion account's attributes are processed
- **THEN** the display attribute is set to the associated identity's name

#### Scenario: uncorrelated managed account keeps account name as display attribute
- **GIVEN** a managed account that is not correlated to any identity
- **WHEN** the Fusion account's attributes are processed
- **THEN** the display attribute is set to the original managed account name

### Requirement: Identity name in Velocity context

For identity-based Fusion accounts, the root identity name SHALL be accessible in the Velocity context as `$identity.name` and SHALL fall back to `$name` when no mapped attribute named `name` exists.

Feature: Fusion account attribute resolution
Rule: For identity-based Fusion accounts, the root identity name SHALL be available as `$identity.name` and SHALL fall back to `$name` when no mapped attribute named `name` exists.

#### Scenario: `$identity.name` resolves to root identity name
- **GIVEN** an identity-based Fusion account built from an identity with `name: "Ada Wong"`
- **WHEN** a Velocity expression references `$identity.name`
- **THEN** the result is "Ada Wong"

#### Scenario: `$identity.name` overrides `identity.attributes.name`
- **GIVEN** an identity-based Fusion account whose identity bag contains `{ name: "Attributes Name" }`
- **WHEN** a Velocity expression references `$identity.name`
- **THEN** the result is the root identity name, not "Attributes Name"

#### Scenario: `$name` falls back to identity name when no mapped name exists
- **GIVEN** an identity-based Fusion account with no mapped attribute named `name`
- **WHEN** a Velocity expression references `$name`
- **THEN** the result is the identity name

#### Scenario: `$name` prefers mapped attribute over identity name
- **GIVEN** an identity-based Fusion account with a mapped attribute `name: "Mapped Name"`
- **WHEN** a Velocity expression references `$name`
- **THEN** the result is "Mapped Name"

#### Scenario: `$account.name` resolves for identity-backed origin snapshot
- **GIVEN** an identity-based Fusion account with origin source "Identities"
- **WHEN** a Velocity expression references `$account.name`
- **THEN** the result is the account display name

### Requirement: Velocity account snapshots use canonical nested source and schema shape

Managed account snapshots in the Velocity context MUST be identified and accessed only through the nested `source` and `schema` objects.

Feature: Fusion account attribute resolution
Rule: The composite managed key MUST be `source.id::schema.id` and no legacy flat-key fallbacks SHALL be consulted.

#### Scenario: managed origin snapshot is resolved by canonical composite key
- **GIVEN** a Fusion account whose origin source is a managed source
- **AND** the source map contains a managed account snapshot with `source.id: "src-hr"` and `schema.id: "native-1"`
- **WHEN** the Velocity `$account` object is resolved
- **THEN** the snapshot with `source.id::schema.id` equal to the account's `originAccountId` MUST be returned
- **AND** no legacy `_id` field is used for matching

#### Scenario: mainAccount ordering uses canonical composite key
- **GIVEN** a Fusion account with `mainAccount` set to `"src-erp::ni-erp"`
- **AND** the source map contains a managed account snapshot with `source.id: "src-erp"` and `schema.id: "ni-erp"`
- **WHEN** the ordered accounts array is built for the Velocity context
- **THEN** the matching snapshot MUST be placed at index 0
- **AND** no legacy `_id` field is used for matching

#### Scenario: Velocity field helpers read nested source and schema only
- **GIVEN** a managed account snapshot with `source: { id: "src-1", name: "HR" }` and `schema: { id: "ni", name: "Jane" }`
- **WHEN** the Velocity snapshot helpers read source id, source name, schema id, and schema name
- **THEN** the results MUST be `"src-1"`, `"HR"`, `"ni"`, and `"Jane"` respectively
- **AND** legacy flat keys `_source`, `_sourceId`, `_name`, and `_managedKey` are ignored

#### Scenario: missing nested source or schema returns empty string
- **GIVEN** a managed account snapshot that lacks a nested `source` object
- **WHEN** the Velocity snapshot source id helper is invoked
- **THEN** the result MUST be an empty string
- **AND** no legacy flat-key fallback is used

