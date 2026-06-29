## ADDED Requirements

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
