## ADDED Requirements

### Requirement: Discovered schema has no case-insensitive duplicate attribute names

The account-discover-schema operation MUST return a schema whose attribute list contains at most one entry per case-insensitive attribute name.

#### Scenario: Discover schema after merging identity and managed attributes

- **GIVEN** configured managed sources and identity attributes that define the same logical attributes with different casing (e.g. `FirstName` vs `firstname`)
- **WHEN** the account-discover-schema operation is invoked
- **THEN** the returned schema MUST NOT contain both `FirstName` and `firstname`
- **AND** the returned schema MUST contain exactly one attribute for each logical name

#### Scenario: Discover schema acceptable to ISC API

- **GIVEN** a connector deployment where schema discovery previously failed due to case-insensitive duplicate attribute names
- **WHEN** the account-discover-schema operation is invoked with the fixed connector
- **THEN** the returned schema MUST be valid for ISC schema registration (no case-insensitive name collisions)
