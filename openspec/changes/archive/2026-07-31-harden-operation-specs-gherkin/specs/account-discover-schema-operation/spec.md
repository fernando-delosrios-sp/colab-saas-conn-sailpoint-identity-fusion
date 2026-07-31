## MODIFIED Requirements

### Requirement: Schema discovery returns account schema

The account-discover-schema operation SHALL fetch all configured sources and build a dynamic Fusion account schema from managed source schemas plus connector attribute mapping and definition configuration, then return that schema via `res.send`.

#### Scenario: Successful schema discovery

- **GIVEN** a valid connector configuration with managed sources and attribute definitions
- **WHEN** the account-discover-schema operation is invoked
- **THEN** the connector SHALL fetch all sources
- **AND** SHALL build the dynamic account schema via `buildDynamicSchema()`
- **AND** SHALL return the complete account schema with all attribute definitions

#### Scenario: Schema discovery with custom attributes

- **GIVEN** normal and unique attribute definitions configured in connector settings
- **WHEN** the account-discover-schema operation is invoked
- **THEN** the returned schema SHALL include attributes derived from those definitions
