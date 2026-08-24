# Clear Normal Attribute on Falsy Definition Output — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a normal attribute definition runs and produces falsy output or fails, clear the stored attribute value instead of preserving the previous value.

**Architecture:** Extend `processNormalDefinition` in `DefinitionService` with a shared clear-or-safe-default helper mirroring the unique-attribute deletion path. Falsy detection stays in `evaluateAttributeTemplate`; only the write branch changes. Core schema attributes continue to receive `fusionAttributeSafeDefault`.

**Tech Stack:** TypeScript, Vitest, Apache Velocity (`velocityjs`), existing definition-service module.

## Global Constraints

- Normal definitions only; do not change unique/static/immutable guard paths.
- Core schema attributes (`fusionIdentityAttribute`, `fusionDisplayAttribute`) must never be left empty.
- Canonical test command: `npm test -- src/services/definitionService/__tests__/defineService.test.ts`
- Full verification: `npm run lint`

---

## Task 1: Clear-or-safe-default helper

**Files:**
- Modify: `src/services/definitionService/definitionService.ts`
- Reference: `openspec/changes/clear-attribute-on-falsy-definition-output/design.md` §D1, §D3

- [ ] **Step 1:** Add private method `applyNormalDefinitionClearOrSafeDefault(definitionName, fusionAccount, context, fusionIdentityAttribute, fusionDisplayAttribute): void`
- [ ] **Step 2:** Implement: call `fusionAttributeSafeDefault`; if non-undefined, assign to attributes + context; else `delete fusionAccount.attributes[name]` and `delete context[name]`
- [ ] **Step 3:** Run lint on file: `npm run lint` (or targeted eslint if available)

---

## Task 2: Wire falsy and error branches (TDD)

**Files:**
- Modify: `src/services/definitionService/definitionService.ts`
- Test: `src/services/definitionService/__tests__/defineService.test.ts`
- Spec: `openspec/changes/clear-attribute-on-falsy-definition-output/specs/definition-service/spec.md`

### 2A — Falsy clears stored value

- [ ] **Step 1:** Write failing test `clears existing normal attribute when template evaluates to empty output`
  - Setup: existing account with `department: 'Engineering'`, definition expression `$missingField` (or helper chain yielding undefined)
  - Assert: after `refreshNormalAttributes`, `department` is undefined / not in attributes
- [ ] **Step 2:** Run test — confirm FAIL
  - `npm test -- src/services/definitionService/__tests__/defineService.test.ts -t "clears existing normal attribute"`
- [ ] **Step 3:** Replace falsy `else` branch in `processNormalDefinition` to call `applyNormalDefinitionClearOrSafeDefault`
- [ ] **Step 4:** Run test — confirm PASS

### 2B — Error clears stored value

- [ ] **Step 1:** Write failing test `clears existing normal attribute when template evaluation errors`
  - Use invalid/malformed expression or mock `evaluateAttributeTemplate` if needed
- [ ] **Step 2:** Run test — confirm FAIL
- [ ] **Step 3:** Replace error branch in `processNormalDefinition` to call `applyNormalDefinitionClearOrSafeDefault` (keep error log)
- [ ] **Step 4:** Run test — confirm PASS

### 2C — Core schema safe default (regression)

- [ ] **Step 1:** Write test `applies safe default for display attribute on falsy output instead of clearing`
- [ ] **Step 2:** Run test — implement/adjust if needed — confirm PASS

### 2D — Unchanged guards (regression)

- [ ] **Step 1:** Write/confirm test static definition with existing value skips evaluation
- [ ] **Step 2:** Write/confirm test non-nullish value overwrites existing value
- [ ] **Step 3:** Run full defineService suite — confirm PASS
  - `npm test -- src/services/definitionService/__tests__/defineService.test.ts`

---

## Task 3: Documentation

**Files:**
- Modify: `docs/reference/velocity-context.md`
- Modify: `docs/use-guides/configuration/defining-attributes.md`

- [ ] **Step 1:** Update velocity-context "Empty output on failure" — normal definitions clear stored values on falsy/error; link to `$previous` example
- [ ] **Step 2:** Update defining-attributes normal-type behavior table with falsy/error clearing note and breaking-change callout
- [ ] **Step 3:** Run `npm run lint:markdown` if docs changed substantially

---

## Task 4: Changelog and final verification

- [ ] **Step 1:** Add CHANGELOG entry (breaking: normal attributes cleared on falsy/error evaluation)
- [ ] **Step 2:** Run `npm run lint`
- [ ] **Step 3:** Run `npm test -- src/services/definitionService/__tests__/defineService.test.ts`

**Commit suggestion:** `fix(definition): clear normal attributes on falsy or failed evaluation`

---

## Spec scenario coverage map

| Scenario | Task |
|---|---|
| Falsy template output clears previously stored value | 2A |
| Template evaluation error clears previously stored value | 2B |
| Core schema attribute receives safe default instead of clearing | 2C |
| Static definition with existing value skips evaluation | 2D |
| Non-nullish rendered value overwrites existing value | 2D |
