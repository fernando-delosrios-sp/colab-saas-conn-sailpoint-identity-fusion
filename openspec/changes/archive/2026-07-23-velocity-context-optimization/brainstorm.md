# Brainstorm: Velocity Render Context Allocation

**Source:** Advisor plan 001 (`advisor-plans/001-velocity-context-optimization.md`)  
**Written against commit:** `3a8b4ac`

## Background

`evaluateVelocityTemplate` in `src/services/definitionService/formatting.ts` runs on every Normal and Unique attribute evaluation during aggregation — thousands of invocations per run. Each call currently:

1. Allocates an intermediate object via `{ ...context, ...contextHelpers }`
2. Allocates a second null-prototype object via `Object.assign(Object.create(null), extendedContext)`

Both allocations are redundant; a single `Object.assign` into a null-prototype object achieves the same result.

## Decision Chain

### Q1: What problem are we solving?

Redundant per-evaluation object allocations in the Velocity render hot path. High leverage, no dependencies, no config changes.

### Q2: What approaches were considered?

**A. Single Object.assign (recommended)**  
Merge `context` and `contextHelpers` directly into one null-prototype object:
```typescript
const renderContext = Object.assign(Object.create(null), context, contextHelpers) as RenderContext
```
- Eliminates intermediate spread allocation
- Preserves existing merge precedence (helpers override context keys)
- Preserves null-prototype security invariant
- One-line change

**B. Reusable context object / object pool**  
Pre-allocate a render context and mutate per call.
- Rejected: Velocity render may retain references; mutation risks cross-call leakage; complexity exceeds benefit for this change

**C. Lazy helper proxy**  
Attach helpers via Proxy only when accessed.
- Rejected: Adds indirection on every helper access; over-engineered for allocation savings

### Q3: Merge precedence — does order matter?

Current spread `{ ...context, ...contextHelpers }` means **contextHelpers override context** on key collision (e.g., an account attribute named `Math` does not shadow the `$Math` helper).

`Object.assign` applies sources left-to-right; later sources win. To preserve behavior:
```typescript
Object.assign(Object.create(null), context, contextHelpers)
```
**Not** `contextHelpers, context` (that would invert precedence).

### Q4: What stays out of scope?

- Velocity syntax parsing
- `contextHelpers` export structure
- Template cache (advisor plan 002)
- New tests beyond existing suite (behavior unchanged)

## Agreed Approach

Single `Object.assign` into null-prototype object, with `context` first and `contextHelpers` second to preserve helper-over-context precedence. No API or config changes.

## Design Trade-offs

| Trade-off | Acceptance |
|-----------|------------|
| Micro-optimization (~1 allocation saved per eval) | High call volume makes it worthwhile |
| No dedicated benchmark in this change | Existing 972-test suite is sufficient regression guard |
| Spec documents invariant, not allocation count | Allocation is implementation detail; null-prototype + helper access are the testable contracts |

## Done Criteria (from advisor plan)

- Intermediate spread object removed
- Render context prototype remains `null`
- All unit tests pass
- `contextHelpers` (Normalize, Math, Datefns, etc.) remain accessible in templates
