## ADDED Requirements

### Requirement: MappingService supports selective target mapping

MappingService SHALL accept an optional `onlyTargets` parameter on `mapAttributes`. When provided, MappingService SHALL evaluate attribute mappings only for target names in that set (plus system-required side effects for `mainAccount` and `history` when those targets are included). When omitted, behavior SHALL remain unchanged (all mapping targets processed).

#### Scenario: Selective map processes coincident targets only

- **GIVEN** attribute maps for `employeeId`, `displayName`, and `department`
- **AND** `onlyTargets` is `Set(['employeeId'])`
- **WHEN** `mapAttributes` runs on a managed FusionAccount
- **THEN** only the `employeeId` mapping SHALL be evaluated and written
- **AND** `displayName` and `department` SHALL NOT be modified by mapping on this invocation

#### Scenario: Full map when onlyTargets omitted

- **GIVEN** the same attribute map configuration
- **WHEN** `mapAttributes` is called without `onlyTargets`
- **THEN** all configured mapping targets SHALL be processed as today
