## Context

`attributeService.ts` is the central module for evaluating identity attributes in the SailPoint Identity Fusion connector. It currently contains ~1,394 lines and mixes service orchestration with low-level Velocity rendering and post-render transforms. A recent commit (`c1e705d`) intentionally removed a non-standard unresolved-variable detection heuristic. The team is now applying Plan E: shrink the god object by extracting the Velocity evaluator and its transform pipeline into a dedicated, testable helper.

## Goals / Non-Goals

**Goals:**
- Extract Velocity template evaluation into a pure, testable function.
- Extract the post-render transform pipeline into a pure, testable function.
- Remove the corresponding private methods from `attributeService.ts`.
- Preserve the current rendering and transform semantics, including standard Velocity undefined-variable behavior.
- Update existing tests and add focused unit tests for the new helper.

**Non-Goals:**
- Redesign the attribute service public API.
- Change the `truncateResultToMaxLength` algorithm or move it out of `formatting.ts`.
- Reintroduce the unresolved-variable heuristic.
- Generalize the transform pipeline beyond the current unique-value / counter-aware truncation behavior.

## Decisions

### D1: Keep the evaluator as a pure function, not a class
- **Choice:** Export `evaluateAttributeTemplate(...)` and `applyOutputTransforms(...)` as pure utility functions.
- **Reason:** Neither helper needs shared mutable state or lifecycle methods. Functions are simpler to import, tree-shake, and unit test.
- **Alternatives considered:** A class-based evaluator. Rejected because it would add boilerplate without improving cohesion.

### D2: Return a structured result object from the evaluator
- **Choice:** `evaluateAttributeTemplate` returns `{ value, error? }`.
- **Reason:** The helper should not log directly. Callers decide how to surface errors, keeping the helper side-effect free.
- **Alternatives considered:** Throwing exceptions. Rejected because the service currently logs and continues; a structured error preserves that control flow.

### D3: Transform helper receives the full definition and expression
- **Choice:** `applyOutputTransforms(raw, definition, expression, context)`.
- **Reason:** Counter-aware truncation needs the definition's `maxLength` and the expression string; passing the full `AnyDefinition` and expression avoids leaking a narrower subset of fields.
- **Alternatives considered:** A narrower `applyOutputTransforms(raw, maxLength)`. Rejected because the unique-value transform also needs context and definition metadata.

### D4: Do not restore the unresolved-variable heuristic
- **Choice:** Standard Velocity semantics remain: `$var` renders literally when undefined; `$!var` suppresses output.
- **Reason:** The heuristic was non-standard and its removal is intentional. The correct fix is to update tests, not code.
- **Alternatives considered:** Restoring the heuristic. Rejected by explicit decision.

## Risks / Trade-offs

- [Risk] A call site or test outside the identified four call sites may still depend on the old heuristic. → Mitigation: Search the codebase for uses of the evaluator and update any affected expectations before running the full test suite.
- [Risk] Logging behavior may subtly change if the returned `error` is not logged with the same level and metadata as the original inline logs. → Mitigation: Log the `error` in the service at the same call sites using the existing logger and message format.
- [Trade-off] The new helper takes more arguments than the original methods. → Accepted because the arguments map directly to the existing context and keep the helper stateless.

## Migration Plan

N/A — this change is a pure TypeScript refactor with no deployment, database, or endpoint changes. Verification is local:
1. `npm test -- --run src/services/attributeService`
2. `npm run typecheck`
3. `npm run lint`

Rollback is a single git revert if issues are discovered.

## Open Questions

- Are there any other test files or consumers that assume the removed unresolved-variable behavior?
- Should the new helper live in `src/services/attributeService/` or move to a shared rendering utilities folder later?
