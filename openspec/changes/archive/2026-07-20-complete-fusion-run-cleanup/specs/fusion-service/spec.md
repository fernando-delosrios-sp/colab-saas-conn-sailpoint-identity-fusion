## MODIFIED Requirements

### Requirement: FusionService receives state via FusionRun

FusionService SHALL access all shared run state through FusionRun at construction time. Internal maps previously held on FusionService (fusionAccountMap, fusionIdentityMap, autoAssignedIdentityIds, linkedAccountKeyIndex, sourcesByName, analysisRecorder) SHALL live on FusionRun.

#### Scenario: FusionService reads fusion accounts from FusionRun
- **WHEN** FusionService needs to iterate fusion accounts
- **THEN** it SHALL read from run.fusionAccountMap, not this.fusionAccountMap

#### Scenario: FusionService reads sources by name from FusionRun
- **WHEN** FusionService needs to resolve a source by name
- **THEN** it SHALL read from run.sourcesByName
- **AND** the sourcesByName property on FusionService SHALL be a delegation getter for ManagedAccountAnalyzerState compatibility, not an independently owned field

## ADDED Requirements

### Requirement: Processors receive explicit state and service dependencies

IdentityProcessor, DecisionProcessor, and CorrelationManager SHALL receive their dependencies explicitly rather than through a single FusionService reference.

#### Scenario: IdentityProcessor reads state from FusionRun
- **WHEN** IdentityProcessor needs to access fusionIdentityMap or fusionAccountMap
- **THEN** it SHALL read from its own `run` parameter, not through fusionService getters
- **AND** it SHALL use fusionService only for service method calls (applyAttributeProcessing, setFusionAccount, registerFusionBlend, etc.)

#### Scenario: DecisionProcessor reads state from FusionRun
- **WHEN** DecisionProcessor needs to iterate fusionAccountMap or fusionIdentityMap
- **THEN** it SHALL read from its own `run` parameter, not through fusionService getters
- **AND** it SHALL access sourcesByName through run, not fusionService

#### Scenario: CorrelationManager receives explicit service dependencies
- **WHEN** CorrelationManager is constructed
- **THEN** it SHALL receive IdentityService, SourceService, and an isAggregationMode callback
- **AND** it SHALL NOT receive a FusionService reference
