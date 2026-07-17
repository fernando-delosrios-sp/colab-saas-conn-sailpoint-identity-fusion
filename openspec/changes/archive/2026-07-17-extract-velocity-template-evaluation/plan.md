# Extract Velocity template evaluation from attributeService

> **For agentic workers:** Use `subagent-driven-development` to implement this plan task-by-task.

**Goal:** Move Velocity template evaluation and the post-render transform pipeline out of `attributeService.ts` into a dedicated, testable `templateEvaluator.ts` module while preserving existing semantics and updating tests for the intentional unresolved-variable behavior change.

**Architecture:** Two pure utility functions (`evaluateAttributeTemplate`, `applyOutputTransforms`) live in `src/services/attributeService/templateEvaluator.ts`. `attributeService.ts` imports them, deletes the private `evaluateTemplate()` and `applyUniqueValueOutputTransforms()` methods, and calls the helpers at the existing four call sites. Counter-aware truncation stays delegated to `formatting.ts`.

**Tech Stack:** TypeScript, Node.js, npm, Jest, Apache Velocity via `safeVelocityCompile`/`evaluateVelocityTemplate`.

---

## Task 1: Create `templateEvaluator.ts`

- [ ] **Step 1.1:** Create `src/services/attributeService/templateEvaluator.ts`.
- [ ] **Step 1.2:** Import `AnyDefinition`, `RenderContext`, `evaluateVelocityTemplate`, `normalize`, `removeSpaces`, `switchCase`, `truncateResultToMaxLength`, `UniqueAttributeDefinition` from `attributeService.ts` and `./formatting`.
- [ ] **Step 1.3:** Implement `evaluateAttributeTemplate(definition, context, options)`:
  - Read `expression` from `options.expressionOverride ?? definition.expression`.
  - Return `{ value: undefined, error: 'Expression is required...' }` if no expression.
  - Call `evaluateVelocityTemplate(expression, context)` inside a `try/catch`.
  - Return `{ value, error: undefined }` on success or `{ value: undefined, error }` on failure.
  - Do **not** apply output transforms here; that is `applyOutputTransforms`'s job.
- [ ] **Step 1.4:** Implement `applyOutputTransforms(raw, definition, expression, context)`:
  - Guard with `typeof raw !== 'string'` and return `raw` unchanged.
  - Apply `trim`, `case`, `spaces`, `normalize` in that order.
  - If `maxLength` and string length > `maxLength`, call `truncateResultToMaxLength(value, expression, context, definition.maxLength)`.
  - Return the transformed string.
- [ ] **Step 1.5:** Export both functions and any shared types.
- [ ] **Step 1.6:** Run `npm test -- --run src/services/attributeService/templateEvaluator.test.ts` (will fail until tests are added; use this to confirm the file compiles after adding tests).

---

## Task 2: Refactor `attributeService.ts`

- [ ] **Step 2.1:** Add `import { evaluateAttributeTemplate, applyOutputTransforms } from './templateEvaluator'`.
- [ ] **Step 2.2:** Remove `evaluateVelocityTemplate`, `normalize`, `removeSpaces`, `switchCase`, and `truncateResultToMaxLength` from the `./formatting` import if they are no longer used elsewhere in the file.
- [ ] **Step 2.3:** Replace the four `evaluateTemplate` call sites:
  - `generateWithIncrementalCounter` (~line 1025): `const evaluated = evaluateAttributeTemplate(definition, context, { accountName: fusionAccount.name }); if (evaluated.error) this.log.error(...); const value = evaluated.value;`.
  - `generateWithCollisionDisambiguation` (~line 1061): same pattern, passing `effectiveExpression` as override.
  - `processNormalDefinition` (~line 1241): same pattern.
  - `isUniqueTemplateValue` (~line 1369): replace `applyUniqueValueOutputTransforms` with `applyOutputTransforms(definition, raw, definition.expression, context)`.
- [ ] **Step 2.4:** Delete the private `evaluateTemplate()` method (~lines 927–964) and the private `applyUniqueValueOutputTransforms()` method (~lines 1376–1393).
- [ ] **Step 2.5:** Make sure debug logging still happens after evaluation (e.g. log `value` when no error).
- [ ] **Step 2.6:** Run `npm run typecheck` and fix any import/type errors.

---

## Task 3: Update `attributeService.test.ts`

- [ ] **Step 3.1:** Locate the tests around `attributeService.test.ts:2673` that call `(service as any).evaluateTemplate` and `(service as any).applyUniqueValueOutputTransforms`.
- [ ] **Step 3.2:** Replace direct private-method tests with imports from `templateEvaluator.ts` where appropriate, or delete the now-private helpers.
- [ ] **Step 3.3:** Update unresolved-variable expectations:
  - For `$var` with no context, expect the literal string `"$var"` instead of `undefined`.
  - For tests that intentionally want suppressed output, change the expression to `$!var` and expect `""`.
- [ ] **Step 3.4:** Run `npm test -- --run src/services/attributeService` and fix test failures until the existing suite passes.

---

## Task 4: Add `templateEvaluator.test.ts`

- [ ] **Step 4.1:** Create `src/services/attributeService/__tests__/templateEvaluator.test.ts`.
- [ ] **Step 4.2:** Add a test: `evaluateAttributeTemplate` renders a simple expression and returns `{ value, error: undefined }`.
- [ ] **Step 4.3:** Add a test: missing expression returns `{ value: undefined, error }`.
- [ ] **Step 4.4:** Add a test: an unresolved `$var` renders literally.
- [ ] **Step 4.5:** Add a test: `$!var` renders empty.
- [ ] **Step 4.6:** Add a test: numeric Velocity result passes through unchanged.
- [ ] **Step 4.7:** Add a test: `applyOutputTransforms` applies trim → case → spaces → normalize → maxLength in order.
- [ ] **Step 4.8:** Add a test: counter-aware `maxLength` reserves counter width and truncates the prefix.
- [ ] **Step 4.9:** Add a test: `applyOutputTransforms` returns non-string inputs unchanged.

---

## Task 5: Verify and document

- [ ] **Step 5.1:** Run `npm test -- --run src/services/attributeService` and ensure all tests pass.
- [ ] **Step 5.2:** Run `npm run typecheck` and fix any remaining errors.
- [ ] **Step 5.3:** Run `npm run lint` and fix any lint errors.
- [ ] **Step 5.4:** Search for any comments or documentation that mention the removed unresolved-variable heuristic and update them.
- [ ] **Step 5.5:** Run the final status command: `openspec status --change extract-velocity-template-evaluation`.
- [ ] **Step 5.6:** Commit after each major task (Task 1, Task 2, Task 3+4, Task 5).

---

## Task 6: Optional code review

- [ ] **Step 6.1:** Run `git diff` to review the extraction.
- [ ] **Step 6.2:** If desired, invoke the `code-review` skill to review the diff against repo standards.
- [ ] **Step 6.3:** Address any critical feedback before marking the change complete.
