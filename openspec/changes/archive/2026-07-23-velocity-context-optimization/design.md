## Context

DefinitionService evaluates Apache Velocity templates for Normal and Unique attribute definitions via `evaluateVelocityTemplate` in `formatting.ts`. Each evaluation builds a render context from caller-supplied account/identity data (`context`) plus exported helper objects (`contextHelpers`: Normalize, Math, Datefns, JSON, AddressParse, etc.).

Current construction (lines 59–61):

```typescript
const extendedContext: RenderContext = { ...context, ...contextHelpers }
const renderContext = Object.assign(Object.create(null), extendedContext) as RenderContext
```

The null-prototype object prevents Velocity from resolving `$constructor` / `$__proto__` via `Object.prototype` — a security invariant established when geo helpers were exposed. The spread-then-assign pattern allocates two objects per call on a path invoked thousands of times per aggregation.

## Goals / Non-Goals

**Goals:**
- Reduce render context allocations from two objects to one per `evaluateVelocityTemplate` call
- Preserve null-prototype security invariant
- Preserve helper-over-context merge precedence (contextHelpers override context on key collision)
- Pass all existing definition-service Velocity tests without modification

**Non-Goals:**
- Velocity template cache optimization (advisor plan 002)
- Changing `contextHelpers` structure or adding new helpers
- Benchmarking allocation counts
- Refactoring `truncateResultToMaxLength` or template cache logic

## Decisions

### D1: Single Object.assign vs object pooling

- **Choice:** Single `Object.assign(Object.create(null), context, contextHelpers)`
- **Reason:** Minimal diff; eliminates intermediate spread; no lifecycle/mutation hazards
- **Considered alternatives:** Reusable pooled context — rejected (mutation risk if Velocity retains references between calls)

### D2: Source order in Object.assign

- **Choice:** `context` first, `contextHelpers` second
- **Reason:** Matches existing `{ ...context, ...contextHelpers }` semantics where helpers override context keys
- **Considered alternatives:** `contextHelpers, context` (as written in advisor plan draft) — rejected because it inverts precedence on key collision

### D3: Spec delta scope

- **Choice:** ADDED requirement documenting render context invariants, not allocation count
- **Reason:** Allocation is implementation detail; null-prototype and helper accessibility are the testable contracts
- **Considered alternatives:** No spec change — rejected; security invariant deserves explicit requirement

## Risks / Trade-offs

- [Risk] Key-collision precedence regression if assign order is wrong → Mitigation: Use `context, contextHelpers` order; existing 1000+ formatting tests cover helper access
- [Risk] Subtle prototype pollution if null prototype dropped → Mitigation: Keep `Object.create(null)` as assign target; add spec requirement
- [Trade-off] No dedicated perf benchmark → Accepted: allocation savings validated by code review; full test suite guards behavior

## Migration Plan

N/A — internal implementation optimization. Deploy via normal connector bundle update. No data migration, config changes, or operator action required.

**Rollback:** Revert the single-line change in `formatting.ts`.

## Open Questions

- None blocking implementation.
