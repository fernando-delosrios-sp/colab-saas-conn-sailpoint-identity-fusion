## ADDED Requirements

### Requirement: DefinitionService utilizes shared snapshot key generator

DefinitionService SHALL utilize a centrally exported shared utility (`getManagedAccountSnapshotKey`) for generating snapshot keys from account attributes to avoid logic duplication across services.

#### Scenario: Definition checks use the shared snapshot key utility
- **WHEN** DefinitionService requires a snapshot key for a managed account snapshot
- **THEN** it invokes the exported utility rather than a local implementation
