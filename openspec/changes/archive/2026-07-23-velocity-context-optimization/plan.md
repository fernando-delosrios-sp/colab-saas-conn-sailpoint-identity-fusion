# Velocity Render Context Optimization Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate redundant object allocation in `evaluateVelocityTemplate` by merging context and helpers in a single null-prototype `Object.assign`.

**Architecture:** One-line change in `formatting.ts`. Replace `{ ...context, ...contextHelpers }` + second `Object.assign` with `Object.assign(Object.create(null), context, contextHelpers)`. Source order preserves helper-over-context precedence. No API, config, or test changes expected.

**Tech Stack:** TypeScript, Node.js, Vitest, velocityjs

**Change artifacts:** `openspec/changes/velocity-context-optimization/` (proposal, design, specs, tasks)

---

## Task 1: Optimize render context construction

**Files:**
- Modify: `src/services/definitionService/formatting.ts`

- [ ] **Step 1:** Open `evaluateVelocityTemplate` (~line 54)
- [ ] **Step 2:** Replace:
  ```typescript
  const extendedContext: RenderContext = { ...context, ...contextHelpers }
  // Null prototype so `$constructor` / `$__proto__` do not resolve via Object.prototype.
  const renderContext = Object.assign(Object.create(null), extendedContext) as RenderContext
  ```
  With:
  ```typescript
  // Null prototype so `$constructor` / `$__proto__` do not resolve via Object.prototype.
  const renderContext = Object.assign(Object.create(null), context, contextHelpers) as RenderContext
  ```
- [ ] **Step 3:** Confirm `contextHelpers` is imported from `./contextHelpers` (unchanged)
- [ ] **Step 4:** Run `npx tsc --noEmit`

---

## Task 2: Definition service regression tests

**Files:**
- Test: `src/services/definitionService/__tests__/formatting.test.ts`
- Test: `src/services/definitionService/__tests__/templateEvaluator.test.ts`

- [ ] **Step 1:** Run formatting tests:
  ```bash
  npm test -- src/services/definitionService/__tests__/formatting.test.ts
  ```
- [ ] **Step 2:** Run template evaluator tests:
  ```bash
  npm test -- src/services/definitionService/__tests__/templateEvaluator.test.ts
  ```
- [ ] **Step 3:** Spot-check helper scenarios pass (Normalize, Math, Datefns, JSON, AddressParse sections in formatting.test.ts)

---

## Task 3: Full verification

- [ ] **Step 1:** Run full suite: `npm test`
- [ ] **Step 2:** Run lint: `npm run lint`
- [ ] **Step 3:** Grep `formatting.ts` — confirm no `extendedContext` or spread merge remains in `evaluateVelocityTemplate`

---

## Reference: Current vs target

| Aspect | Current | Target |
|--------|---------|--------|
| Allocations per eval | 2 objects | 1 object |
| Prototype | `null` | `null` (unchanged) |
| Merge precedence | helpers override context | helpers override context (unchanged) |
| Helper access | via spread + assign | via single assign |
| Files touched | — | `formatting.ts` only |

## Out of scope

- Template cache / LRU (advisor plan 002)
- `contextHelpers/index.ts` changes
- New unit tests (existing suite covers behavior)
- Performance benchmarking
