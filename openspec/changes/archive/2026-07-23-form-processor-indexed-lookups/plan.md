# Form Processor Indexed Lookups Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate `Object.values().find()` linear scans in dictionary form-input extraction by using direct key lookup with `for...in` fallback.

**Architecture:** Localized changes to three private/exported helpers in `formProcessor.ts`. Flat-path branches unchanged. Dictionary path tries `dict[fieldId]` first, then iterates keys matching `item?.id === fieldId` with the same value/description checks as today. No new public APIs.

**Tech Stack:** TypeScript, Node.js, Vitest

**Change artifacts:** `openspec/changes/form-processor-indexed-lookups/` (proposal, design, specs, tasks)

---

## Task 1: Optimize `readCorrelatedIdentityId`

**Files:**
- Modify: `src/services/formService/formProcessor.ts`

- [ ] **Step 1:** Open `readCorrelatedIdentityId` (~line 35)
- [ ] **Step 2:** After flat `readString` attempt, replace:
  ```typescript
  const inputObj = Object.values(dict ?? {}).find(
      (x: any) => x?.id === FusionAttribute.IdentityId && (x.value || x.description)
  )
  ```
  With direct lookup + fallback:
  ```typescript
  const direct = dict[FusionAttribute.IdentityId]
  if (direct && (direct.value || direct.description)) {
      const val = direct.value || direct.description
      if (typeof val === 'string' && val.length > 0) return val
  }
  for (const key in dict) {
      const item = dict[key]
      if (item?.id === FusionAttribute.IdentityId && (item.value || item.description)) {
          const val = item.value || item.description
          if (typeof val === 'string' && val.length > 0) return val
      }
  }
  return undefined
  ```
- [ ] **Step 3:** Run `npx tsc --noEmit`

---

## Task 2: Optimize `extractAccountInfoFromFormInput` dictionary branch

**Files:**
- Modify: `src/services/formService/formProcessor.ts`

- [ ] **Step 1:** Open dictionary branch (~line 110)
- [ ] **Step 2:** Replace three `Object.values(formInputs ?? {}).find(...)` calls with direct lookups:
  - `formInputs?.account` or fallback scan for `id === 'account'`
  - Same pattern for `name` and `source` after account is found
- [ ] **Step 3:** Preserve account value check `(x.value?.length ?? 0) > 0` and name/source `value || description` fallback
- [ ] **Step 4:** Leave flat-path branches (lines 100–109) untouched

---

## Task 3: Optimize `extractCandidateIdsFromFormInput`

**Files:**
- Modify: `src/services/formService/formProcessor.ts`

- [ ] **Step 1:** Open dictionary branch (~line 147)
- [ ] **Step 2:** Replace:
  ```typescript
  const candidatesInput = Object.values(formInputs).find(
      (x: any) => x?.id === 'candidates' && (x.value || x.description)
  )
  ```
  With direct `formInputs.candidates` check + `for...in` fallback
- [ ] **Step 3:** Preserve comma-split/trim/filter logic unchanged

---

## Task 4: Form processor regression tests

**Files:**
- Test: `src/services/formService/__tests__/formProcessor.test.ts`

- [ ] **Step 1:** Run form processor tests:
  ```bash
  npm test -- src/services/formService/__tests__/formProcessor.test.ts
  ```
- [ ] **Step 2:** Verify scenarios pass unchanged:
  - Flat account/candidates extraction
  - Dictionary with arbitrary keys (`a`, `b`)
  - Description fallback for candidates
  - `createFusionDecision` SUBMITTED state and composite account id validation

---

## Task 5: Full verification

- [ ] **Step 1:** Run full suite: `npm test`
- [ ] **Step 2:** Run lint: `npm run lint`
- [ ] **Step 3:** Grep `formProcessor.ts` — confirm no `Object.values` in extraction helpers

---

## Reference: Current vs target

| Aspect | Current | Target |
|--------|---------|--------|
| Dictionary lookup | `Object.values().find()` | Direct key + `for...in` fallback |
| Flat path | unchanged | unchanged |
| Extracted values | baseline | identical |
| Files touched | — | `formProcessor.ts` only |

## Out of scope

- `formBuilder.ts`
- FormService / FusionRun orchestration
- New unit tests (existing suite covers behavior)
- Performance benchmarking
