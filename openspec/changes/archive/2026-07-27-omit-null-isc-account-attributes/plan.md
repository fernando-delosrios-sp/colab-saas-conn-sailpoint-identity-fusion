# Omit Null ISC Account Attributes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Omit null and undefined keys from ISC account attribute output while preserving non-null values and empty arrays.

**Architecture:** Single-pass change inside `SchemaService.getFusionAttributeSubset` — the existing schema iteration loop skips property assignment when the cast output is nullish. Internal FusionAccount bags are unchanged; only platform-facing subset objects shrink.

**Tech Stack:** TypeScript, Vitest, `@sailpoint/connector-sdk`

## Global Constraints

- Node.js 24 (`.nvmrc`)
- No new configuration surface
- Do not filter empty strings or empty arrays
- Input attribute bag must not be mutated

---

## Task 1: Add failing tests for getFusionAttributeSubset

**Files:**
- Modify: `src/services/schemaService/__tests__/schemaService.test.ts`
- Reference: `openspec/changes/omit-null-isc-account-attributes/specs/schema-service/spec.md`

- [ ] **Step 1:** Add `describe('getFusionAttributeSubset')` block with schema setup via `setFusionAccountSchema` using a minimal test schema (id, name, department multi=false, reviews multi=true)
- [ ] **Step 2:** Test — `{ id: '1', name: 'Ada', department: null }` → result has `id` and `name`, no `department` key
- [ ] **Step 3:** Test — `{ id: '1', name: 'Ada', reviews: [] }` → result has `reviews: []`
- [ ] **Step 4:** Test — input bag with null is not mutated after call
- [ ] **Step 5:** Run `npx vitest run src/services/schemaService/__tests__/schemaService.test.ts` — expect new tests fail (null keys still present)

---

## Task 2: Implement nullish omission in getFusionAttributeSubset

**Files:**
- Modify: `src/services/schemaService/schemaService.ts`

- [ ] **Step 1:** In the loop, replace unconditional assign with:

```typescript
if (value === null || value === undefined) continue
const casted = schemaDef ? this.castAttributeValue(value, schemaDef) : value
if (casted === null || casted === undefined) continue
fusionAttributes[attribute] = casted
```

- [ ] **Step 2:** Update JSDoc on `getFusionAttributeSubset` — document that nullish cast values are omitted from the returned object
- [ ] **Step 3:** Run `npx vitest run src/services/schemaService/__tests__/schemaService.test.ts` — expect pass

---

## Task 3: Align downstream tests

**Files:**
- Check: `src/services/fusionService/__tests__/fusionService.test.ts`
- Check: `src/operations/__tests__/chain/harness/ReplayAdapter.ts`

- [ ] **Step 1:** Run `npx vitest run src/services/fusionService/__tests__/fusionService.test.ts`
- [ ] **Step 2:** Fix any tests asserting `"attr": null` in getISCAccount output
- [ ] **Step 3:** Run chain harness tests if ReplayAdapter affected

---

## Task 4: Final verification

- [ ] **Step 1:** Run `npm run lint`
- [ ] **Step 2:** Run `npm test` or targeted vitest paths above
- [ ] **Step 3:** Optional dry-run spot-check — confirm streamed accounts lack null-valued keys for sparse mapped attrs
