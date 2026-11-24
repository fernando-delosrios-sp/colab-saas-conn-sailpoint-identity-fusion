# Delta for definition-service

## ADDED Requirements

### Requirement: ProcessUniqueDefinition preserves existing identity and display attributes during reset

When `processUniqueDefinition` evaluates a Unique attribute on an existing Fusion account (`isExistingFusionAccount === true`) that already has a valid value for `fusionIdentityAttribute` or `fusionDisplayAttribute`, it SHALL register that existing value in the unique registry and return without regenerating it, even when `needsReset` is `true`.

#### Scenario: Existing Fusion account preserves name when needsReset is true

- **GIVEN** an existing Fusion account with `name` `"barrett.cline"` and `needsReset: true`
- **AND** a Unique definition for `name`
- **WHEN** `processUniqueDefinition` runs for `name`
- **THEN** `name` SHALL remain `"barrett.cline"`
- **AND** `"barrett.cline"` SHALL be registered in the unique registry for `name`
