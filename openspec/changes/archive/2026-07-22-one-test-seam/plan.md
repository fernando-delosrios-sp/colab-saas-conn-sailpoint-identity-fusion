## Prerequisites

- [ ] Confirm `npm test` passes on clean checkout (baseline)
- [ ] Confirm `npm run lint` passes on clean checkout

---

## Task 1: Create unified test registry factory

**Commit: `feat: add createTestRegistry factory for single-seam test harness`**

### 1.1 Create `src/operations/__tests__/harness/testRegistry.ts`

```typescript
// pseudocode — write TDD-style with .test.ts first, then implementation
import { ServiceRegistry } from '../../../../services/serviceRegistry'
import { FakeApiAdapter } from '../chain/harness/fakeApiAdapter'
import { FusionConfig } from '../../../../model/config'

export interface TestRegistryOptions {
    sourceConfigs?: Array<{ name: string; correlationMode?: string; sourceType?: string }>
    overrides?: Partial<Record<string, unknown>> // typed per-service overrides
}

export function createTestRegistry(options: TestRegistryOptions = {}): ServiceRegistry {
    const config = { sources: options.sourceConfigs ?? [] } as FusionConfig
    const context = { connectionService: null, ...options.overrides } as any
    // Use context.connectionService = null to force ClientService construction
    // with FakeApiAdapter
    const registry = new ServiceRegistry(config, context, { send: vi.fn() } as any, 'test')
    return registry
}
```

**Verify**: `npx tsc --noEmit` passes. File is importable.

### 1.2 Export type alias

Add `export type TestRegistry = ServiceRegistry` so tests reference the real type.

**Verify**: Import in a throwaway test to confirm types resolve.

---

## Task 2: Port corePipeline.test.ts

**Commit: `refactor: port corePipeline tests to createTestRegistry`**

### 2.1 Replace import

```diff
- import { createRegistry as createMockRegistry } from '../../__tests__/harness/registryMocking'
+ import { createTestRegistry } from '../../__tests__/harness/testRegistry'
```

### 2.2 Refactor `createRegistry` helper

Replace the local `createRegistry()` wrapper with:
```typescript
function createRegistry() {
    return createTestRegistry({
        sourceConfigs: [{ name: 'fusion', correlationMode: 'none', sourceType: 'authoritative' }],
    })
}
```

### 2.3 Port pipeline phase tests

For each test that mutates mock properties (e.g., `registry.sources.hasFusionSource = false`), use typed property access on the real `ServiceRegistry`.

For tests that override service methods (e.g., `processFusionAccounts`), pass overrides through `createTestRegistry.overrides`.

### 2.4 Port PipelineRunner.run tests

Replace the `beforeEach` that builds from `createRegistry()` and mutates it with factory-based construction. Use `overrides` for scenario-specific mocks.

**Verify**: `npx vitest run src/operations/helpers/__tests__/corePipeline.test.ts` passes.

---

## Task 3: Port operation test files

**Commit: `refactor: port operation tests to createTestRegistry`**

### 3.1 accountRead.test.ts

- Replace import from `registryMocking` with `createTestRegistry`
- Replace `const registry = createRegistry()` with factory call
- Replace `as any` service mutations with typed overrides

### 3.2 accountCreate.test.ts

Same pattern as 3.1.

### 3.3 accountDisable.test.ts

Same pattern as 3.1.

### 3.4 accountEnable.test.ts

Same pattern as 3.1.

### 3.5 accountList.test.ts

- Replace import from `mockRegistry` with `createTestRegistry`
- Replace `createBaseOperationRegistry(sourceConfigs)` with `createTestRegistry({ sourceConfigs })`
- Replace `SourceConfigLike` import from deleted file with local type or inline definition
- This is the primary consumer of `mockRegistry.ts` — verify all scenarios pass

**Verify**: Run each test file individually after porting:
```
npx vitest run src/operations/__tests__/accountRead.test.ts
npx vitest run src/operations/__tests__/accountCreate.test.ts
npx vitest run src/operations/__tests__/accountDisable.test.ts
npx vitest run src/operations/__tests__/accountEnable.test.ts
npx vitest run src/operations/__tests__/accountList.test.ts
```

---

## Task 4: Port helper tests

**Commit: `refactor: port helper tests to createTestRegistry`**

### 4.1 dryRunHelpers.test.ts

- Check if it imports from mock registries (search did not show direct imports, but it may use mock objects)
- If it uses `any`-cast mock objects, replace with `createTestRegistry({ overrides: { ... } })`

### 4.2 generateReport.test.ts

Same check and port as 4.1.

**Verify**: Run helper test files individually.

---

## Task 5: Refactor ReplayAdapter to use real pipeline

**Commit: `refactor: ReplayAdapter delegates to real ServiceRegistry and PipelineRunner`**

### 5.1 Replace mock registry with createTestRegistry

In `buildReplayContext`:
```diff
- import { createBaseOperationRegistry, SourceConfigLike } from '../../harness/mockRegistry'
+ import { createTestRegistry } from '../../harness/testRegistry'

- const { registry } = createBaseOperationRegistry(sourceConfigs)
+ const registry = createTestRegistry({ sourceConfigs: sourceConfigs as any })
```

### 5.2 Delete pipeline simulation code

Remove the mock implementations of `processFusionAccounts`, `processIdentities`, `processFusionAccount`, `processIdentity`, `getISCAccount`, `forEachISCAccount`, `streamAndClearEligibleAccounts`, `refreshUniqueAttributes`, `correlateMissingAccountsPerSource` that currently re-implement pipeline logic.

### 5.3 Delegate to real pipeline

Replace manual step execution with:
```typescript
import { PipelineRunner } from '../../../../helpers/corePipeline'

// Inside a run wrapper:
await ServiceRegistry.run(registry, async () => {
    await PipelineRunner.run(registry, {
        mode: { kind: 'aggregation' },
        targetPhase: 'process',
    })
})
```

### 5.4 Capture outputs from res.send()

Keep `collectOutputs` and `compareOutputs` unchanged — they read from `res.send()` mock calls which the real pipeline populates.

### 5.5 Keep helper functions

Retain `findIdentityIdForIscAccount` and `ensureFusionAccountsPopulated` if they are still needed for populating state before the real pipeline runs.

**Verify**: `npx vitest run src/operations/__tests__/chain/chain.replay.test.ts` passes.

### 5.6 Port explore.test.ts

Replace `buildReplayContext` usage with the refactored version.

**Verify**: `npx vitest run src/operations/__tests__/chain/explore.test.ts` passes.

---

## Task 6: Delete obsolete mock files

**Commit: `chore: delete mockRegistry.ts and registryMocking.ts`**

### 6.1 Delete files

```bash
rm src/operations/__tests__/harness/mockRegistry.ts
rm src/operations/__tests__/harness/registryMocking.ts
```

### 6.2 Clean up imports

Run `npx tsc --noEmit` to find any remaining references. Fix any that slipped through.

**Verify**: `npx tsc --noEmit` passes with zero errors.

---

## Task 7: Full verification

**Commit: `chore: final verification pass for one-test-seam`**

### 7.1 Run full test suite

```bash
npm test
```

All tests must pass. No skipped tests (`it.skip` or `describe.skip`) related to the refactor.

### 7.2 Run lint

```bash
npm run lint
```

Zero warnings and errors.

### 7.3 Check for remaining references

```bash
grep -r "mockRegistry\|registryMocking" src/ --include="*.ts"
```

Must return no matches (except in comments referencing the change itself).

### 7.4 Check for as any on registries

```bash
grep -r "as any" src/operations/__tests__/ --include="*.ts" | grep -i registry
```

Should return zero or only deliberate non-registry casts.

---

## Definition of Done

- [ ] `createTestRegistry` factory exists and is used by all operation tests
- [ ] `mockRegistry.ts` and `registryMocking.ts` are deleted
- [ ] `ReplayAdapter` delegates to real `PipelineRunner`
- [ ] `npm test` passes with all tests
- [ ] `npm run lint` passes
- [ ] `npx tsc --noEmit` passes
- [ ] No imports of deleted files anywhere
- [ ] No `as any` casts on `ServiceRegistry` instances in test code
