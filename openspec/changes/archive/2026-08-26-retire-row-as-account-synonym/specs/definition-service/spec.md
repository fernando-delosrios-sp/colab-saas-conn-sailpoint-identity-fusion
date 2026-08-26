## MODIFIED Requirements

### Requirement: Disabled identity scope excludes identity data from Define

When `includeIdentities` is `false`, DefinitionService SHALL NOT expose the identity bag, identity alias, or an Identities origin snapshot from managed-origin Fusion accounts through the Velocity context. Identity-derived display-attribute overrides SHALL also be disabled for those Fusion accounts. Managed account snapshots and current mapped attributes SHALL remain available. Identity-origin Fusion accounts explicitly created for required support identities, such as global reviewers, SHALL retain their own identity context.

#### Scenario: Normal definition cannot read identity attributes when identity scope is disabled
- **GIVEN** `includeIdentities` is `false`
- **AND** a managed-origin Fusion account has an identity bag with `department` `"Identity HR"`
- **AND** a Normal definition expression `"$!identity.department"`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the defined attribute SHALL be absent
