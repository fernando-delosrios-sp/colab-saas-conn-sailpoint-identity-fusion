# fusion-schema-attribute-names Specification

## Purpose
TBD - created by archiving change add-fusion-attribute-enum. Update Purpose after archive.
## Requirements
### Requirement: FusionAttribute enum exists

The connector MUST export a TypeScript `enum` named `FusionAttribute` from `src/data/schema.ts`. The enum MUST be string-valued, and the runtime value of each member MUST equal the `name` of a corresponding entry in `fusionAccountSchemaAttributes`. The enum MUST NOT include `name` or `id`.

#### Scenario: Every member is a string with the expected value

- **WHEN** a developer inspects `FusionAttribute.MissingAccounts`
- **THEN** its value is the string `"missing-accounts"`
- **AND** the same is true for every other member of the enum

#### Scenario: The enum contains the ten current default attributes

- **WHEN** a developer iterates the enum members
- **THEN** it contains exactly: `History`, `Statuses`, `Actions`, `Accounts`, `MissingAccounts`, `Reviews`, `Sources`, `MainAccount`, `OriginSource`, `OriginAccount`

#### Scenario: The enum excludes the structural identity keys

- **WHEN** a developer inspects the enum members
- **THEN** it does NOT contain `name` or `id` (those are SDK structural keys, not default attribute references)

### Requirement: Internal call sites use the enum

Every internal call site that reads, writes, or otherwise references a default Fusion schema attribute name in production code MUST pass a `FusionAttribute` member instead of a raw string literal. This includes `attributeToSet` arguments, attribute-bag `bag[...]` keys, `readPathString` path elements that name a default attribute, and the `groupAttribute` field in the dynamic schema builder.

#### Scenario: Production code references the enum for reads

- **WHEN** the connector reads the persisted `missing-accounts` collection during `FusionAccount.fromFusionAccount`
- **THEN** the call is `attributeToSet(attributes, FusionAttribute.MissingAccounts)`
- **AND** the same pattern is used for `History`, `Statuses`, `Actions`, `Accounts`, `Reviews`, `Sources`, `MainAccount`, `OriginSource`, and `OriginAccount` at every site that currently uses a raw string

#### Scenario: Production code references the enum for writes

- **WHEN** the connector syncs collection state into the attribute bag via `syncCollectionAttributesToBag`
- **THEN** each `bag[...]` write uses `bag[FusionAttribute.<Member>]` instead of a quoted string

#### Scenario: Dynamic schema builder references the enum

- **WHEN** `SchemaService.buildDynamicSchema` constructs the dynamic `AccountSchema`
- **THEN** the `groupAttribute` field is set to `FusionAttribute.Actions`

#### Scenario: Test fixtures simulating persisted data still use string literals

- **WHEN** a unit test constructs a persisted fusion account with an `accounts: ['src-a::user-1']` or `missing-accounts: ['src-a::missing-1']` array read from storage
- **THEN** the array may still be a `string[]` literal because the test is simulating deserialized data, not invoking the production code path

### Requirement: Enum and schema array cannot drift

A unit test in `src/data/__tests__/schema.test.ts` MUST assert the contract between `FusionAttribute` and `fusionAccountSchemaAttributes`:

- Every enum member's string value MUST equal the `name` of some entry in `fusionAccountSchemaAttributes`.
- The enum MUST have exactly ten members (the current count, after excluding `name` and `id`).
- The enum MUST NOT contain the string values `"name"` or `"id"`.

#### Scenario: A default attribute is added in only one place

- **WHEN** a developer adds a new entry to `fusionAccountSchemaAttributes` but forgets to add a matching `FusionAttribute` member
- **THEN** the test still passes (the test asserts the enum is a subset of the schema; adding to the schema is allowed without enum change)
- **AND** the developer's code review is expected to catch the missing enum member

#### Scenario: An enum member is added that has no matching schema entry

- **WHEN** a developer adds a new `FusionAttribute` member but forgets to add the matching `fusionAccountSchemaAttributes` entry
- **THEN** the contract test fails with a clear message identifying the orphan value
