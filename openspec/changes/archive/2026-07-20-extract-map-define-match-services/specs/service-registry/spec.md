# service-registry Spec (Delta)

## MODIFIED Requirements

### Requirement: ServiceRegistry creates FusionRun first

ServiceRegistry SHALL instantiate FusionRun as the first service container, before any other services, so that stateless services can receive it at construction time.

#### Scenario: FusionRun instantiated before services
- **WHEN** ServiceRegistry is constructed
- **THEN** FusionRun SHALL be the first object created
- **AND** all subsequent service instantiations SHALL receive FusionRun as a constructor parameter

### Requirement: ServiceRegistry instantiates MapService and DefineService

ServiceRegistry SHALL instantiate MapService and DefineService in the constructor, in dependency order, replacing the previous AttributeService instantiation.

#### Scenario: MapService and DefineService replace AttributeService
- **WHEN** ServiceRegistry is constructed
- **THEN** MapService SHALL be instantiated with config and log
- **AND** DefineService SHALL be instantiated with config, schemas, log, locks, and FusionRun
- **AND** No AttributeService SHALL be instantiated

### Requirement: ServiceRegistry instantiates MatchService

ServiceRegistry SHALL instantiate MatchService in the constructor, replacing the previous ScoringService instantiation, with expanded dependencies.

#### Scenario: MatchService replaces ScoringService
- **WHEN** ServiceRegistry is constructed
- **THEN** MatchService SHALL be instantiated with config, log, FusionRun, forms, and defineService
- **AND** No ScoringService SHALL be instantiated

## RENAMED Requirements

FROM: `this.scoring` field in ServiceRegistry TO: `this.match` field in ServiceRegistry

FROM: `this.attributes` field in ServiceRegistry TO: `this.map` + `this.define` fields in ServiceRegistry
