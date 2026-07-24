## ADDED Requirements

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

## REMOVED Requirements

*(None — the legacy flat-key requirement was already absent from the main spec.)*
