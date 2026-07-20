# service-registry Spec

## Purpose

The service registry (`src/services/serviceRegistry.ts`) is the connector's request-scoped service container. It uses Node's `AsyncLocalStorage` to make the long-lived service instances (config, log, lock, client, etc.) available to the operations layer without threading them through every call site, and resolves the right `Context` and `StandardCommand` for the current request. This spec defines the contract for what is available where, how scoped vs. unscoped services are distinguished, and what an operation can rely on by the time it starts executing.

## Requirements

### Requirement: Request-Scoped Dependency Injection
The `ServiceRegistry` MUST use `AsyncLocalStorage` to store the active context for each concurrent operation instead of a static property, ensuring that concurrently executing operations do not overwrite each other's registry.

#### Scenario: Concurrent Operations
- **WHEN** two operations run concurrently in the same process
- **THEN** nested services correctly access their respective operation's registry state.

### Requirement: Pipeline Lock Lifecycle
The aggregation pipeline lock MUST be hoisted outside of setup tasks that may throw exceptions.

#### Scenario: Setup Exception
- **WHEN** `setupPhase` throws an exception (e.g. schema fetch timeout)
- **THEN** the pipeline correctly tracks that the process lock was acquired and releases it in the `finally` block.

### Requirement: Velocity Prototype Isolation
The connector MUST NOT mutate the global `velocityjs.Compile.prototype`.

#### Scenario: Velocity Attribute Patch
- **WHEN** an attribute is compiled via Velocity
- **THEN** the compiler uses a subclass (`SafeCompile`) that patches dangerous property access without affecting other consumers in the process.




### Requirement: ServiceRegistry creates FusionRun first

ServiceRegistry SHALL instantiate FusionRun as the first service container, before any other services, so that stateless services can receive it at construction time.

#### Scenario: FusionRun instantiated before services
- **WHEN** ServiceRegistry is constructed
- **THEN** FusionRun SHALL be the first object created
- **AND** all subsequent service instantiations SHALL receive FusionRun as a constructor parameter

### Requirement: ServiceRegistry instantiates MappingService and DefinitionService

ServiceRegistry SHALL instantiate MappingService and DefinitionService in the constructor, in dependency order, replacing the previous AttributeService instantiation.

#### Scenario: MappingService and DefinitionService replace AttributeService
- **WHEN** ServiceRegistry is constructed
- **THEN** MappingService SHALL be instantiated with config and log
- **AND** DefinitionService SHALL be instantiated with config, schemas, log, locks, and FusionRun
- **AND** No AttributeService SHALL be instantiated

### Requirement: ServiceRegistry instantiates MatchingService

ServiceRegistry SHALL instantiate MatchingService in the constructor, replacing the previous ScoringService instantiation, with expanded dependencies.

#### Scenario: MatchingService replaces ScoringService
- **WHEN** ServiceRegistry is constructed
- **THEN** MatchingService SHALL be instantiated with config, log, FusionRun, forms, and definitionService
- **AND** No ScoringService SHALL be instantiated

### Requirement: Operation Must Send Response
The connector operation handler SHALL guarantee that any custom or default operation concludes by explicitly calling `res.send()` or `res.error()`. If an operation completes its logic but fails to invoke either method, the system MUST immediately throw an explicit error to prevent a hanging request.

#### Scenario: Operation succeeds but fails to respond
- **WHEN** a custom operation handler finishes its asynchronous execution cleanly without throwing an exception
- **AND** it has not called `res.send()` or `res.error()` on the provided response object
- **THEN** the system throws a ConnectorError specifying that the operation finished without responding

#### Scenario: Operation responds correctly
- **WHEN** a custom operation handler finishes its asynchronous execution
- **AND** it has called `res.send()` or `res.error()` during its execution
- **THEN** the system completes normally and does not throw any additional errors

#### Scenario: Operation crashes before responding
- **WHEN** a custom operation handler throws an unhandled exception before calling `res.send()` or `res.error()`
- **THEN** the system catches the original exception and throws a ConnectorError wrapping the original failure, without being masked by the missing response check

