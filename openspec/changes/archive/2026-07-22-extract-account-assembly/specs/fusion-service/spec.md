## MODIFIED Requirements

### Requirement: Processors receive explicit state and service dependencies

IdentityProcessor, DecisionProcessor, and CorrelationManager SHALL receive their dependencies explicitly rather than through a single FusionService reference, and SHALL delegate account assembly recipe steps to the `AccountAssembly` service.

#### Scenario: IdentityProcessor reads state from FusionRun
- **WHEN** IdentityProcessor needs to access fusionIdentityMap or fusionAccountMap
- **THEN** it SHALL read from its own `run` parameter, not through fusionService getters
- **AND** it SHALL use `AccountAssembly` for account assembly operations.

#### Scenario: DecisionProcessor reads state from FusionRun
- **WHEN** DecisionProcessor needs to iterate fusionAccountMap or fusionIdentityMap
- **THEN** it SHALL read from its own `run` parameter, not through fusionService getters
- **AND** it SHALL access sourcesByName through run and use `AccountAssembly` for account assembly.

#### Scenario: CorrelationManager receives explicit service dependencies
- **WHEN** CorrelationManager is constructed
- **THEN** it SHALL receive IdentityService, SourceService, and an isAggregationMode callback
- **AND** it SHALL NOT receive a FusionService reference
