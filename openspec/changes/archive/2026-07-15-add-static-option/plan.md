# Static Option for Normal Attributes Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** Add a 'static' option to normal attribute definitions that skips recalculation if a value already exists.

**Architecture:** Add the `static` flag to the JSON schema and `NormalAttributeDefinition` type, then intercept evaluation in `attributeService.ts` to return early if a value exists.

**Tech Stack:** TypeScript, Jest, JSON Schema

---

## Task 1: Schema Updates

- [ ] **Step 1:** In `connector-spec.json`, locate the normal attributes section and add the `static` boolean toggle, with appropriate `helpKey` describing the mutual exclusivity.
- [ ] **Step 2:** Ensure `refresh` help text also mentions mutual exclusivity.
- [ ] **Step 3:** In `src/model/connector-spec-types.ts` (if it exists) or wherever `NormalAttributeDefinition` is defined, add `static?: boolean`.

## Task 2: Core Evaluation Logic

- [ ] **Step 1:** In `src/services/attributeService/attributeService.ts`, inside `processNormalDefinition`, extract `static` from `definition`.
- [ ] **Step 2:** Modify the early return logic. If `definition.static` is true and `hasValue` is true, return immediately UNLESS `canResetDisplay` or `fusionAccount.needsReset` dictates otherwise. Make sure it ignores `fusionAccount.needsRefresh`.

## Task 3: Testing and Validation

- [ ] **Step 1:** Add a unit test to `src/services/attributeService/__tests__/attributeService.test.ts` (or equivalent test file) where a normal attribute has `static: true` and no value, verifying it gets evaluated.
- [ ] **Step 2:** Add a unit test where the attribute has `static: true` and an existing value, and `needsRefresh` is true. Verify it is NOT evaluated.
- [ ] **Step 3:** Add a unit test where the attribute has `static: true`, an existing value, but `needsReset` is true. Verify it IS evaluated.
