## ADDED Requirements

### Requirement: Handle Identity Attributes in Schema Discovery
The schema discovery process MUST safely list identity attributes from the SailPoint Identity Security Cloud API and merge them with other attributes in the dynamic schema.

#### Scenario: Successfully discovering schema with identity attributes
- **GIVEN** includeIdentities is set to true or default (not false)
- **WHEN** the listIdentityAttributes API succeeds with a list of valid identity attributes
- **THEN** these attributes are mapped to SchemaAttributes (type mapped to lowercase, entitlements defaulted to false) and merged into the dynamic schema.

#### Scenario: Skipping identity attributes in schema discovery
- **GIVEN** includeIdentities is set to false in the config
- **WHEN** schema discovery runs
- **THEN** the Identity Attributes API is not called, and no identity attributes are added to the dynamic schema.

#### Scenario: Preventing undefined name attributes
- **GIVEN** includeIdentities is enabled
- **WHEN** the Identity Attributes API returns an attribute with an empty or undefined name
- **THEN** that attribute is excluded from the dynamic schema.

#### Scenario: Case-insensitive deduplication preserving original casing
- **GIVEN** includeIdentities is enabled
- **WHEN** there is a case collision between an account schema attribute (e.g., "EmployeeID") and an identity attribute (e.g., "employeeid")
- **THEN** only one attribute is returned, preserving the original/intended casing (e.g., "EmployeeID") in the dynamic schema rather than overwriting it with the lowercase version.

#### Scenario: Safe mapping of custom/unknown attribute types
- **GIVEN** includeIdentities is enabled
- **WHEN** the Identity Attributes API returns an attribute with an unrecognized or custom type
- **THEN** it defaults to type "string" to ensure it matches the Connector SDK types.

#### Scenario: Logging and handling API failures gracefully
- **GIVEN** includeIdentities is enabled
- **WHEN** the Identity Attributes API fails or returns an error
- **THEN** the error is logged, and depending on configuration, the connector either logs it as a warning/error and continues, or fails the discovery run with a clear message.

## MODIFIED Requirements

## REMOVED Requirements
