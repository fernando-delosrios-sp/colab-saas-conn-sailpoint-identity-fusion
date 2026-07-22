## Why

Test infrastructure uses four overlapping mock seams (`mockRegistry.ts`, `registryMocking.ts`, context overrides, and a 758-line `ReplayAdapter` that re-implements the real pipeline). These mocks cast everything `as any`, pin the implementation's internal call graph, and cause refactors to cascade into harness breakage with no locality between the change and its test fallout. Consolidating to a single seam at the `IscApiAdapter` boundary lets tests drive the real pipeline through the actual `ServiceRegistry`, making refactors safe and mocks type-checked.

## What Changes

**Delete duplicate mock registries**
- From: Two parallel mock registries (`mockRegistry.ts` 164L, `registryMocking.ts` ~80L) with ~80% overlap, both casting `as any`
- To: Single `createTestRegistry()` factory that builds a real `ServiceRegistry` with `FakeApiAdapter` as the only substituted dependency
- Reason: Eliminates drift between mock implementations; type-checked interface
- Impact: Breaking for test code only (no production code changes)

**Refactor ReplayAdapter to run real pipeline**
- From: 758-line `ReplayAdapter` re-implements pipeline phases independently of `corePipeline.ts`
- To: `ReplayAdapter` delegates to the real `ServiceRegistry`-backed operation, capturing outputs for comparison
- Reason: Prevents pipeline drift; adapter no longer needs coordinated edits on phase changes
- Impact: Internal harness refactor, existing replay tests continue passing

**Drive tests through ServiceRegistry.run()**
- From: Tests construct mock registries piecemeal and pass them via context
- To: Every operation test calls `ServiceRegistry.run(registry, () => operation(...))` with only `FakeApiAdapter` overridden
- Reason: Same code paths as production; refactors no longer bounce off harnesses
- Impact: Test code only

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `testing`: Test harness SHALL use a single mock seam at the `IscApiAdapter` boundary, driving operations through the real `ServiceRegistry`. Mock registries that duplicate service internals SHALL be removed. `ReplayAdapter` SHALL delegate to the real pipeline instead of re-implementing it.

## Impact

- **Files deleted**: `src/operations/__tests__/harness/mockRegistry.ts`, `src/operations/__tests__/harness/registryMocking.ts`
- **Files refactored**: `src/operations/__tests__/chain/harness/ReplayAdapter.ts`, `src/operations/__tests__/chain/harness/fakeApiAdapter.ts`
- **Files added**: `src/operations/__tests__/harness/testRegistry.ts` (single factory)
- **Test files updated**: All operation test files (`dryRun.test.ts`, `accountList.test.ts`, `accountRead.test.ts`, `corePipeline.test.ts`, `dryRunHelpers.test.ts`, `generateReport.test.ts`, chain tests)
- **No production code changes**
