## Context

The connector SDK executes multiple commands in the same Node.js process environment concurrently. Some internal components currently rely on static/global state and unprotected lock sequences which leak context across concurrent executions. These concurrency hazards lead to unpredictable data bleed, broken locks, and process-wide prototype mutation.

## Goals / Non-Goals

**Goals:**
- Eliminate cross-request state leakage by scoping the `ServiceRegistry` to the current execution context.
- Ensure the pipeline process lock is strictly tracked and reliably released on exceptions.
- Prevent `velocityjs` from polluting global prototypes across the process.

**Non-Goals:**
- Removing the "customizer" pattern that overrides services (we want to preserve this capability).
- Refactoring the entire `ServiceRegistry` into explicit prop-drilling.

## Decisions

**Decision 1: AsyncLocalStorage for ServiceRegistry**
- **Rationale:** Using `AsyncLocalStorage` from `node:async_hooks` allows us to create an execution-tree-scoped singleton instead of a process-wide `static current` singleton. This avoids prop-drilling while perfectly isolating the registry per-request.
- **Alternative:** Explicitly passing `ServiceRegistry` everywhere (prop-drilling). Rejected due to the massive refactoring required.

**Decision 2: Hoist Process Lock Acquisition**
- **Rationale:** Moving `sources.setProcessLock()` out of `setupPhase` and directly into the `try` block of `PipelineRunner.run` allows us to set the `processLockAcquired` flag immediately upon acquisition, guaranteeing release in the `finally` block.
- **Alternative:** Adding `try/finally` inside `setupPhase` just for the lock. Rejected because it fragments the locking lifecycle away from the orchestration layer.

**Decision 3: SafeCompile Subclass for Velocity**
- **Rationale:** Instead of replacing `Compile.prototype.getAttributes` globally in `velocityPrototypeGuard.cjs`, we will create a `SafeCompile` class extending `velocityjs.Compile` and overriding the methods safely.
- **Alternative:** Proxy wrappers. Subclassing is more direct and has less overhead for this specific patch.

## Risks / Trade-offs

- **Risk:** `AsyncLocalStorage` has a minor performance overhead.
  - **Mitigation:** The overhead is negligible in modern Node.js and well worth the guarantee of state isolation.
