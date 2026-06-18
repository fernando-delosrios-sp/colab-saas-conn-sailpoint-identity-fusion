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

