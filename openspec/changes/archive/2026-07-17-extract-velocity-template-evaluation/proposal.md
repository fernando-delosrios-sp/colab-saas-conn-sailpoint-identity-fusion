## Why

`attributeService.ts` has grown to ~1,394 lines and is hard to unit test. The Velocity template evaluator and its post-render transform pipeline are buried inside the service, duplicated across four call sites, and cannot be tested in isolation. Extracting this logic into a dedicated helper will shrink the god object, make the transform pipeline testable, and preserve the existing Velocity semantics that the service already uses. This is a focused inside-out extraction under Plan E, not a redesign of the attribute service.

## What Changes

**Velocity template evaluation**
- From: `evaluateTemplate()` lives as a private method inside `attributeService.ts` and is used by four call sites.
- To: A new `templateEvaluator.ts` module exports `evaluateAttributeTemplate(definition, context, options)` returning `{ value, error? }`.
- Reason: The evaluator has no dependency on service state and is easier to test as a pure function.
- Impact: Non-breaking for callers; the service will log errors from the returned `error` field.

**Post-render transform pipeline**
- From: `applyUniqueValueOutputTransforms()` is a private method in the service.
- To: `templateEvaluator.ts` exports `applyOutputTransforms(raw, definition, expression, context)`.
- Reason: The unique-value transform pipeline is a self-contained rendering concern, not a service-level concern.
- Impact: Non-breaking; the `$isUnique` path will call the new helper.

**Unresolved-variable behavior**
- From: A custom heuristic returned `undefined` for unresolved `$var` references.
- To: Standard Velocity semantics apply: `$var` renders literally when undefined; `$!var` suppresses output.
- Reason: The heuristic was non-standard and its removal is intentional.
- Impact: Breaking only for tests that relied on the old heuristic; those tests must be updated.

**Test coverage**
- Add `templateEvaluator.test.ts` covering evaluation, transform order, counter-aware maxLength, non-string Velocity returns, and missing-expression errors.
- Update `attributeService.test.ts` expectations to match standard Velocity semantics.

## Capabilities

### New Capabilities
- `attributeService`: Extract Velocity template evaluation and the post-render output-transform pipeline into a dedicated `templateEvaluator.ts` helper module.

### Modified Capabilities
- `attributeService`: Remove the unresolved-variable detection heuristic; unresolved `$var` references now render literally per standard Velocity semantics.

## Impact

- `src/services/attributeService/attributeService.ts`: Remove `evaluateTemplate()` and `applyUniqueValueOutputTransforms()`; import and call helpers from `templateEvaluator.ts`.
- `src/services/attributeService/templateEvaluator.ts`: New module with the two exported functions.
- `src/services/attributeService/__tests__/attributeService.test.ts`: Update expectations for unresolved variables.
- `src/services/attributeService/__tests__/templateEvaluator.test.ts`: New unit tests.
- `src/services/attributeService/formatting.ts`: No change to `truncateResultToMaxLength`; the new helper continues to delegate to it.
