# Brainstorm: One test seam at the platform boundary

## Background

Test infrastructure for connector operations currently uses four overlapping mock seams, creating a fragile harness that pins the implementation instead of verifying behavior:

| Seam | Location | Issue |
|------|----------|-------|
| Context overrides (15 branches) | `serviceRegistry.ts` constructor | Every test can substitute any service; too many knobs |
| `mockRegistry.ts` | `src/operations/__tests__/harness/` | 164 lines of `vi.fn()`-backed mock services |
| `registryMocking.ts` | `src/operations/__tests__/harness/` | ~80% overlap with `mockRegistry.ts`, both cast `as any` |
| `ReplayAdapter.ts` | `src/operations/__tests__/chain/harness/` | 758 lines re-implementing the 438-line real pipeline |

## Problem analysis

**Q1: What's the root cause of test fragility?**

Tests mock the pipeline's internal call graph. `dryRun.test.ts` alone has 38 `vi.fn()` calls. Both registry mocks cast everything `as any`, so TypeScript renames fail silently at runtime (never at compile time). When the real pipeline phases change, tests that mock internal steps break with no locality between the change and the fallout.

**Q2: Why does ReplayAdapter duplicate the pipeline?**

ReplayAdapter re-codes Map/Define evaluation order as a parallel implementation of the operation run. It dials real `MappingService` and `DefinitionService` but wires them over mock registry pieces. Any phase structure change forces coordinated edits in both the real pipeline AND the ReplayAdapter — the exact opposite of what a test harness should guarantee (independent verification).

**Q3: Can we reduce this to one seam?**

Yes. The `ServiceRegistry` constructor already accepts context overrides for every service. If we feed it a real `ServiceRegistry` but substitute only the boundary — `IscApiAdapter` + `Context` — the entire real pipeline runs under test with the same code paths as production.

## Agreed approach

**One seam pattern:**

```
operation → real ServiceRegistry
              │
   real services · real pipeline
              │
   ─ ─ ─ ─ IscApiAdapter seam ─ ─ ─ ─   ◀ the only mock
```

**What changes:**
1. Delete `mockRegistry.ts` (164 lines)
2. Delete `registryMocking.ts` (~80 lines)  
3. Refactor `ReplayAdapter` to run the real pipeline instead of re-implementing it
4. Make all operation tests drive through `ServiceRegistry.run()` with `FakeApiAdapter` as the only substituted dependency
5. Tests that currently cast `as any` switch to type-checked mocks against the real adapter interface

**What stays:**
- `FakeApiAdapter` — becomes the canonical test double (already implements `IscApiAdapter`)
- `ServiceRegistry` context-override constructor — used as designed
- All existing test assertions — ported to the new harness

## Trade-offs considered

**A: Keep both registries, just deduplicate** — Rejected. 80% overlap means any merge adds indirection without solving the real problem (mocks pinning internals).

**B: Delete ReplayAdapter entirely** — Rejected. It validates operation outputs against recorded goldens. We need the replay capability, just not as a pipeline fork.

**C: One seam with real pipeline** — Chosen. Maximum leverage: one harness, all operations. Mocks type-check. Pipeline changes don't cascade into harness changes.

## Design questions resolved

- **Should `FakeApiAdapter` stay a class?** Yes. Already typed against `IscApiAdapter`. Making it a plain object loses the interface contract.
- **Should we add test factories for ServiceRegistry?** Yes — a single `createTestRegistry()` helper that accepts `FakeApiAdapter` + source config, returns a fully wired registry.
- **What about tests that need specific service behavior?** Individual test files can still override specific service methods via context overrides on top of the real registry. This is the existing constructor pattern used correctly.

## Benefits

- **Interface**: tests cross one seam
- **Type safety**: mocks type-check against real adapter
- **Refactor resilience**: pipeline changes no longer bounce off harnesses
- **Drift prevention**: ReplayAdapter can't drift from real pipeline
- **Leverage**: one harness, all operations
