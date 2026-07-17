<!--
Raw capture of brainstorming output.

本檔原樣捕捉 brainstorming 的產出，不強制結構。
design.md 從本檔萃取並重新整理為結構化設計文件。

不要將本檔的內容複製到 design.md — design.md 是獨立的重組產物，
兩者互補但不重疊。
-->

# Brainstorm: Extract Velocity template evaluation from attributeService

## Background

`src/services/attributeService/attributeService.ts` has grown into a ~1,394-line god object. One of its responsibilities is Velocity template evaluation plus a small post-render transform pipeline (unique-value transforms, truncation, etc.). This logic is currently embedded inside the service, making it hard to unit test in isolation and contributing to the file’s size.

A recent commit (`c1e705d`) removed an unresolved-variable detection heuristic. Under standard Velocity semantics, `$var` now renders literally when undefined; users who want suppression should use `$!var`. That intentional behavior change broke several existing tests that expected `undefined` for unresolved variables.

## Decision chain

### Q1: Should we restore the unresolved-variable heuristic?

**Decision:** No. The heuristic was non-standard and surprising. Standard Velocity semantics are simpler and well documented. The correct fix is to update the tests, not the code.

### Q2: Should the new evaluator be a class or functions?

**Decision:** Use pure utility functions. There is no shared mutable state to justify a class, and functions are easier to import and test.

### Q3: What should the evaluator return?

**Decision:** `evaluateAttributeTemplate(definition, context, options)` returns `{ value, error? }`. Callers decide how to log or surface the error. This keeps the helper side-effect free.

### Q4: What signature should the transform helper use?

**Decision:** `applyOutputTransforms(raw, definition, expression, context)` accepts the raw Velocity output, the full `AnyDefinition`, the original expression string, and the rendering context. This gives the helper everything it needs for counter-aware truncation without leaking service internals.

### Q5: Should truncation logic move?

**Decision:** Keep `truncateResultToMaxLength` in `formatting.ts`. `applyOutputTransforms` delegates to it; no algorithm change.

## Design trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| A. Inline refactor in `attributeService.ts` | Smaller diff | Does not improve testability or reduce file size |
| B. Extract to a new `templateEvaluator.ts` module (chosen) | Testable, shrinks god object, preserves existing semantics | Requires updating call sites and tests |
| C. Extract + redesign transform DSL | Cleaner abstraction | Larger change, out of scope for Plan E |

## Approved design

1. Create `src/services/attributeService/templateEvaluator.ts` exporting:
   - `evaluateAttributeTemplate(...)` → `{ value, error? }`
   - `applyOutputTransforms(raw, definition, expression, context)` → transformed value
2. Update `attributeService.ts`:
   - Import the two functions.
   - Delete `evaluateTemplate()` and `applyUniqueValueOutputTransforms()`.
   - Wire the four call sites to `evaluateAttributeTemplate()` and log via the returned `error`.
   - Wire `$isUnique` to `applyOutputTransforms()`.
3. Update `attributeService.test.ts` to align with standard Velocity semantics:
   - Expect literal strings for `$var` when undefined, or use `$!var` where suppression is intended.
4. Add `templateEvaluator.test.ts` covering evaluation, transform order, counter-aware maxLength, non-string Velocity returns, and missing-expression errors.
5. Verify with `npm test`, `npm run typecheck`, `npm run lint`.

## Open questions / risks

- Ensure no other callers rely on the removed heuristic.
- Keep logging behavior equivalent by surfacing the evaluator’s `error` in the service.
- Avoid changing `truncateResultToMaxLength` algorithm; only delegate to it.
