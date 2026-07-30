## ADDED Requirements

### Requirement: Schema attributes deduplicated case-insensitively

The schema service MUST deduplicate `SchemaAttribute` entries by case-insensitive name. When two or more attributes share the same lowercase name, the service MUST retain the first attribute encountered in processing order and MUST discard all subsequent variants without merging their metadata.

#### Scenario: Managed source and identity attribute name collision

- **GIVEN** a managed source account schema containing attribute `firstname`
- **AND** identity schema attributes containing attribute `FirstName`
- **WHEN** `SchemaService.buildDynamicSchema` constructs the dynamic `AccountSchema`
- **THEN** the returned schema MUST contain exactly one attribute whose lowercase name is `firstname`
- **AND** that attribute MUST be the first variant encountered in merge order

#### Scenario: Multiple casing variants within one source

- **GIVEN** a managed source account schema containing both `Username` and `username`
- **WHEN** `SchemaService.buildDynamicSchema` constructs the dynamic `AccountSchema`
- **THEN** the returned schema MUST contain exactly one attribute whose lowercase name is `username`
- **AND** that attribute MUST be the first variant from the source attribute list

#### Scenario: Schema ingestion deduplicates input attributes

- **GIVEN** an input `AccountSchema` whose `attributes` array contains both `LastName` and `lastname`
- **WHEN** `SchemaService.setFusionAccountSchema` is called with that schema
- **THEN** internal schema attribute name lists MUST contain exactly one entry whose lowercase name is `lastname`
- **AND** `getFusionAttributeSubset` MUST NOT emit both `LastName` and `lastname` keys for the same logical attribute

#### Scenario: No duplicate lowercase names in output

- **GIVEN** any combination of fusion, managed, identity, mapping, definition, and reverse-correlation attributes with case-insensitive overlaps
- **WHEN** `SchemaService.buildDynamicSchema` returns
- **THEN** no two entries in `attributes` MAY share the same lowercase `name`
