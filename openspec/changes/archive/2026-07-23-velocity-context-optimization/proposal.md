## Why

Every Velocity template evaluation in `evaluateVelocityTemplate` allocates two objects: an intermediate spread `{ ...context, ...contextHelpers }` and a null-prototype render context via `Object.assign`. Attribute templates run thousands of times per aggregation, so this redundant allocation adds GC pressure on a hot path. The fix is a single-line merge with no behavior or API change.

## What Changes

**Render context construction**
- From: Two-step allocation — spread into `extendedContext`, then `Object.assign(Object.create(null), extendedContext)`
- To: Single `Object.assign(Object.create(null), context, contextHelpers)` with null prototype preserved
- Reason: Eliminate one object allocation per template evaluation
- Impact: Non-breaking; identical template output and helper precedence

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `definition-service`: Document render context construction invariants (null prototype, helper merge precedence, helper accessibility)

## Impact

- **Code:** `src/services/definitionService/formatting.ts` (`evaluateVelocityTemplate` only)
- **Tests:** Existing `formatting.test.ts` and `templateEvaluator.test.ts` must pass unchanged
- **Operations:** Reduced allocation rate during aggregation; no config or deployment changes
- **Dependencies:** None
