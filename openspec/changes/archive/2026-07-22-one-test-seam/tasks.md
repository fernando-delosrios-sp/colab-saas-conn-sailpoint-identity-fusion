## 1. Create unified test registry factory

- [x] 1.1 Create `src/operations/__tests__/harness/testRegistry.ts` with `createTestRegistry(sourceConfigs, overrides?)` that builds a real `ServiceRegistry` with `FakeApiAdapter` and optional per-service overrides
- [x] 1.2 Export a type-safe `TestRegistry` type (aliased to `ServiceRegistry`) so test files reference the real types without `as any`

## 2. Port corePipeline test to real registry

- [x] 2.1 Replace `createRegistry` import from `registryMocking` with `createTestRegistry` in `corePipeline.test.ts`
- [x] 2.2 Update pipeline phase tests (`refreshPhase`, `processPhase`, `outputPhase`) to use real `ServiceRegistry` — configure `SourceService` and `FusionService` via overrides instead of mutating mock properties
- [x] 2.3 Update `PipelineRunner.run` tests to build registry through factory instead of ad-hoc mock assembly
- [x] 2.4 Remove `as any` casts from test code; use typed overrides

## 3. Port operation tests to real registry

- [x] 3.1 Replace `createRegistry` import with `createTestRegistry` in `accountRead.test.ts`
- [x] 3.2 Replace `createRegistry` import with `createTestRegistry` in `accountCreate.test.ts`
- [x] 3.3 Replace `createRegistry` import with `createTestRegistry` in `accountDisable.test.ts`
- [x] 3.4 Replace `createRegistry` import with `createTestRegistry` in `accountEnable.test.ts`
- [x] 3.5 Replace `createBaseOperationRegistry` / `createMockRegistry` with `createTestRegistry` in `accountList.test.ts` — this is the primary consumer of `mockRegistry.ts`

## 4. Port helper tests

- [x] 4.1 Replace `createRegistry` import with `createTestRegistry` in `dryRunHelpers.test.ts`
- [x] 4.2 Replace mock registry usage with `createTestRegistry` in `generateReport.test.ts`

## 5. Refactor ReplayAdapter to use real pipeline

- [x] 5.1 Add a `createTestRegistry` call inside `buildReplayContext` instead of assembling mock pieces
- [x] 5.2 Configure `FakeApiAdapter` API mocks from prerecorded chain state data
- [x] 5.3 Delegate execution to `PipelineRunner.run()` with appropriate `targetPhase`
- [x] 5.4 Capture `res.send()` outputs for comparison in `compareOutputs`
- [x] 5.5 Delete pipeline simulation code (Map/Define phases, manual step execution) from ReplayAdapter
- [x] 5.6 Verify replay tests pass with the refactored adapter

## 6. Port chain framework tests

- [x] 6.1 Update chain test files to use `createTestRegistry` where they currently construct mock contexts
- [x] 6.2 Ensure `FakeApiAdapter` works as the adapter in chain framework tests

## 7. Delete obsolete mock files

- [x] 7.1 Delete `src/operations/__tests__/harness/mockRegistry.ts`
- [x] 7.2 Delete `src/operations/__tests__/harness/registryMocking.ts`
- [x] 7.3 Remove re-exports or barrel imports referencing deleted files

## 8. Verification and cleanup

- [x] 8.1 Run `npm test` — all tests must pass
- [x] 8.2 Run `npx tsc --noEmit` — no type errors
- [x] 8.3 Run `npm run lint` — no lint errors, no dead imports
- [x] 8.4 Verify no remaining imports of `mockRegistry` or `registryMocking` in the codebase
- [x] 8.5 Verify no `as any` casts on registry objects in test code
