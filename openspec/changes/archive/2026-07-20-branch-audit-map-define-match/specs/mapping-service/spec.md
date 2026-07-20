## ADDED Requirements

### Requirement: MappingService utilizes shared snapshot key generator

MappingService SHALL utilize a centrally exported shared utility (`getManagedAccountSnapshotKey`) for generating snapshot keys from account attributes to avoid logic duplication across services.

#### Scenario: Mapping uses the shared snapshot key utility
- **WHEN** MappingService requires a snapshot key for a managed account
- **THEN** it invokes the exported utility rather than implementing a local fallback
