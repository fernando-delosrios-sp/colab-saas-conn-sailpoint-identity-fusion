## 1. Velocity Prototype Safety

- [ ] 1.1 Create `src/utils/safeVelocityCompile.ts` containing the `SafeCompile` class extending `velocityjs.Compile` with safe property access.
- [ ] 1.2 Update `src/services/attributeService/formatting.ts` to instantiate `SafeCompile`.
- [ ] 1.3 Delete `src/services/attributeService/velocityPrototypeGuard.cjs`.
- [ ] 1.4 Update `package.json` to remove the copy command for `velocityPrototypeGuard.cjs` in the `build` script.

## 2. Process Lock Hoisting

- [ ] 2.1 Remove `await sources.setProcessLock()` from `setupPhase` in `src/operations/helpers/corePipeline.ts`.
- [ ] 2.2 Add `await sources.setProcessLock()` and `processLockAcquired = true` into the `try` block of `PipelineRunner.run()` inside `corePipeline.ts`.

## 3. Request-Scoped ServiceRegistry

- [ ] 3.1 Update `src/services/serviceRegistry.ts` to replace `static current` with `AsyncLocalStorage`.
- [ ] 3.2 Add a static `run(reg: ServiceRegistry, callback: () => Promise<T>)` method to `ServiceRegistry` and update `getCurrent()` to read from storage.
- [ ] 3.3 Update `src/utils/operationHandler.ts` to wrap `runOperation` in the `ServiceRegistry.run` context.
- [ ] 3.4 Refactor operation entry points (e.g. `src/operations/accountList.ts`) and tests to remove manual calls to `ServiceRegistry.setCurrent` and wrap execution properly if needed, or rely solely on `operationHandler`.
