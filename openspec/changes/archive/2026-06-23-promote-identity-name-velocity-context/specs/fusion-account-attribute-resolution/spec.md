## MODIFIED Requirements

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
