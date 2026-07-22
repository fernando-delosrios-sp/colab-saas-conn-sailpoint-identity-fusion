## Context

The test infrastructure for connector operations has grown four parallel mock seams over time:

1. **Context overrides** — `ServiceRegistry` constructor accepts service overrides via context; tests pass pre-constructed mock services (15 branches).
2. **`mockRegistry.ts`** (164 lines) — `createBaseOperationRegistry()` builds a `vi.fn()`-backed mock object with `FakeApiAdapter` wired in, used by `accountList.test.ts`.
3. **`registryMocking.ts`** (~80 lines) — `createRegistry()` builds a separate `vi.fn()`-backed mock with ~80% overlap, used by `accountRead.test.ts`, `accountCreate.test.ts`, `accountDisable.test.ts`, `accountEnable.test.ts`, and `corePipeline.test.ts`.
4. **`ReplayAdapter.ts`** (758 lines) — re-implements pipeline phases independently of the real `corePipeline.ts`, wired over mock registry pieces.

Both mock registries cast everything `as any`, so TypeScript renames pass at compile time but fail silently at runtime. When pipeline phases change, tests that mock internal steps break with no locality between the change and its test fallout.

The `ServiceRegistry` constructor already supports context overrides for every service. `FakeApiAdapter` already implements the `IscApiAdapter` interface. The building blocks for a single-seam harness exist — they just need to be assembled correctly.

## Goals / Non-Goals

**Goals:**
- Replace all mock registries with a single factory that builds a real `ServiceRegistry` with only `IscApiAdapter` and `Context` substituted
- Make `ReplayAdapter` delegate to the real pipeline instead of re-implementing it
- Delete `mockRegistry.ts` and `registryMocking.ts`
- Ensure all existing tests continue to pass with equivalent assertions
- Eliminate `as any` casts on the test registry (replace with type-checked access)

**Non-Goals:**
- Rewriting test assertions or changing what is tested
- Modifying production code paths
- Adding new test coverage
- Changing `FakeApiAdapter`'s interface (it stays a class implementing `IscApiAdapter`)

## Decisions

### D1: Single factory for test registries

- **Choice**: A `createTestRegistry(sourceConfigs, overrides?)` function that constructs a real `ServiceRegistry` with `FakeApiAdapter` as the adapter and optional service overrides via a typed partial `ServiceRegistry` object.
- **Rationale**: Eliminates two duplicate mock files (~244 lines total) and ensures tests always exercise the real wiring between services. Per-test overrides (e.g., a custom `sourceService` for a specific scenario) are supported through the optional `overrides` parameter, which uses the existing context-override constructor pattern.
- **Alternatives considered**:
  - *Merge both mock files* — Rejected because the overlap is 80% and the real problem is mock internals, not the number of files.
  - *Build registry from scratch in each test* — Rejected because ~15 lines of identical setup per test is boilerplate the factory eliminates.

### D2: ReplayAdapter delegates to PipelineRunner

- **Choice**: `buildReplayContext` instantiates a real `ServiceRegistry` (via `createTestRegistry`) configured with `FakeApiAdapter` backed by prerecorded API responses, then calls `PipelineRunner.run()` and captures `res.send()` outputs.
- **Rationale**: Eliminates 758 lines of duplicated pipeline logic. The adapter no longer needs to know about phase ordering, Map/Define evaluation sequence, or service wiring. Phase changes in `corePipeline.ts` automatically apply to replay tests without coordinated harness edits.
- **Alternatives considered**:
  - *Delete ReplayAdapter entirely* — Rejected because replay tests validate operation outputs against recorded goldens, providing value that unit tests alone don't cover.
  - *Keep ReplayAdapter as-is but stop maintaining it* — Rejected because drift between real and replayed pipelines invalidates the test.

### D3: Typed `ServiceRegistry` overrides

- **Choice**: The `overrides` parameter of `createTestRegistry` accepts a `Partial<Record<keyof ServiceRegistry, unknown>>` that gets spread into the constructor context. Test files access `registry.fusion` etc. with full TypeScript types, not `as any`.
- **Rationale**: Catches renames at compile time. Makes it obvious which service each test is overriding.
- **Alternatives considered**:
  - *Keep `as any` casts* — Rejected because the whole point is to make mocks type-safe.

### D4: Leave FakeApiAdapter as-is

- **Choice**: No changes to `FakeApiAdapter`'s class structure or interface.
- **Rationale**: It already implements `IscApiAdapter`. Making it a plain object would lose the interface contract that makes the single-seam pattern type-check. The adapter stays as the canonical test double for the platform boundary.
- **Alternatives considered**: *Replace with vi.fn()-backed plain object* — Rejected because it loses interface type checking.

## Risks / Trade-offs

- **[Risk]** Some tests construct ad-hoc mock objects (`{ fusion, identities, sources, log } as any`) that don't go through the factory. Porting them requires understanding each test's specific mock behavior.
  - **Mitigation**: Port one test file at a time, run tests after each. The factory supports per-service overrides for tests that need non-default behavior.
- **[Risk]** ReplayAdapter's `buildReplayContext` method delegates to the full pipeline, which may be slower than the current manual step simulation.
  - **Mitigation**: Replay tests are integration-style and already slow; the real pipeline overhead is negligible compared to the current manual simulation which executes the same service calls.
- **[Trade-off]** Tests become slightly more coupled to `ServiceRegistry`'s dependency graph. If a new service is added, `createTestRegistry` must provide it.
  - **Acceptance**: This is desirable — it means tests catch wiring errors at construction time rather than at runtime.

## Migration Plan

1. Create `src/operations/__tests__/harness/testRegistry.ts` with the unified factory
2. Port `corePipeline.test.ts` (most complex mock user) to the new factory
3. Port `accountList.test.ts`, `accountRead.test.ts`, `accountCreate.test.ts`, `accountDisable.test.ts`, `accountEnable.test.ts`
4. Refactor `ReplayAdapter` to use real pipeline via `createTestRegistry` + `PipelineRunner.run()`
5. Port remaining test files (`dryRunHelpers.test.ts`, `generateReport.test.ts`, chain tests)
6. Delete `mockRegistry.ts` and `registryMocking.ts`
7. Run full test suite (`npm test`) to verify no regressions
8. Run lint (`npm run lint`) to verify no dead imports or unused code

**Rollback**: Revert the commit. No production code is modified.

## Open Questions

- `dryRun.test.ts` has 38 `vi.fn()` calls. How many of these can be eliminated by using the real pipeline? (Likely most, since the pipeline should handle internal service calls without manual mocking.)
- Some chain tests construct mock contexts directly. Determine whether they can use the factory or need special handling.
