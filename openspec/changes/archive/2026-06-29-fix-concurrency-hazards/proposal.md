## Why

The connector process is long-lived and handles multiple concurrent requests in the same execution environment. Currently, several components rely on process-global state, causing race conditions, data leaks between concurrent commands, and unreleased locks during exceptions. Fixing these concurrency hazards is critical to ensure data integrity and stability in production.

## What Changes

- Replaces the `ServiceRegistry.current` static singleton with `AsyncLocalStorage` to ensure request-scoped dependency injection and customizer isolation.
- Hoists the process lock acquisition out of `setupPhase` into `PipelineRunner.run` to guarantee the lock state is accurately tracked and released in the `finally` block even if setup operations throw exceptions.
- Replaces global prototype mutation of `velocityjs.Compile.prototype` with a `SafeCompile` subclass to prevent prototype pollution that could affect other consumers in the same Node.js process.

## Capabilities

### New Capabilities

- None

### Modified Capabilities

- None

## Impact

- `src/services/serviceRegistry.ts`: Updated to use `AsyncLocalStorage`.
- `src/utils/operationHandler.ts`: Updated to wrap execution in `ServiceRegistry.run()`.
- `src/operations/helpers/corePipeline.ts`: Lock acquisition moved to orchestration layer.
- `src/services/attributeService/velocityPrototypeGuard.cjs`: Removed.
- `src/utils/safeVelocityCompile.ts`: Added for `SafeCompile`.
- `src/services/attributeService/formatting.ts`: Updated to use `SafeCompile`.
