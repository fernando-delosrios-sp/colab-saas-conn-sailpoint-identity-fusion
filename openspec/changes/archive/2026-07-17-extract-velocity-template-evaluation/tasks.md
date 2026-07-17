## 1. Create the new `templateEvaluator.ts` module

- [x] 1.1 Create `src/services/attributeService/templateEvaluator.ts`.
- [x] 1.2 Implement `evaluateAttributeTemplate(definition, context, options)` returning `{ value, error? }`.
- [x] 1.3 Implement `applyOutputTransforms(raw, definition, expression, context)` delegating to `truncateResultToMaxLength` for counter-aware truncation.
- [x] 1.4 Export both functions from the module.

## 2. Refactor `attributeService.ts`

- [x] 2.1 Import `evaluateAttributeTemplate` and `applyOutputTransforms` from `templateEvaluator.ts`.
- [x] 2.2 Remove the private `evaluateTemplate()` method and its helper code.
- [x] 2.3 Remove the private `applyUniqueValueOutputTransforms()` method.
- [x] 2.4 Wire the four existing call sites to `evaluateAttributeTemplate()` and log via the returned `error` field.
- [x] 2.5 Wire the `$isUnique` path to `applyOutputTransforms()`.
- [x] 2.6 Ensure no references to the removed heuristic remain.

## 3. Update and add tests

- [x] 3.1 Update `src/services/attributeService/__tests__/attributeService.test.ts` expectations for unresolved variables (literal `$var` or `$!var`).
- [x] 3.2 Create `src/services/attributeService/__tests__/templateEvaluator.test.ts`.
- [x] 3.3 Cover successful evaluation plus output transforms.
- [x] 3.4 Cover transform pipeline order.
- [x] 3.5 Cover counter-aware maxLength.
- [x] 3.6 Cover non-string Velocity returns passing through unchanged.
- [x] 3.7 Cover missing expression returning an error.

## 4. Verify and document

- [x] 4.1 Run `npm test -- --run src/services/attributeService` and fix failures.
- [x] 4.2 Run `npm run typecheck` and fix type errors.
- [x] 4.3 Run `npm run lint` and fix lint errors.
- [x] 4.4 Review any user-facing documentation or comments that mention the old unresolved-variable heuristic and update if present.
