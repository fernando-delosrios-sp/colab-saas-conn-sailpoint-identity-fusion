# Trigram Allocation Optimization Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce per-iteration string allocation in trigram extraction and index query by replacing character concatenation with `substring`.

**Architecture:** Two expression changes in `trigramIndex.ts`. Replace `padded[i] + padded[i + 1] + padded[i + 2]` with `padded.substring(i, i + 3)` in `extractTrigrams` and `queryAttributeIndex`. Padding template, loop bounds, and return types unchanged. No API, config, or test changes expected.

**Tech Stack:** TypeScript, Node.js, Vitest

**Change artifacts:** `openspec/changes/trigram-allocation-optimization/` (proposal, design, specs, tasks)

---

## Task 1: Optimize `extractTrigrams`

**Files:**
- Modify: `src/services/matchingService/trigramIndex.ts`

- [ ] **Step 1:** Open `extractTrigrams` (~line 15)
- [ ] **Step 2:** Replace loop body:
  ```typescript
  result.add(padded[i] + padded[i + 1] + padded[i + 2])
  ```
  With:
  ```typescript
  result.add(padded.substring(i, i + 3))
  ```
- [ ] **Step 3:** Confirm padding and loop range unchanged:
  ```typescript
  const padded = `  ${normalized} `
  for (let i = 0; i <= len - 3; i++)
  ```
- [ ] **Step 4:** Run `npx tsc --noEmit`

---

## Task 2: Optimize `queryAttributeIndex`

**Files:**
- Modify: `src/services/matchingService/trigramIndex.ts`

- [ ] **Step 1:** Open `queryAttributeIndex` (~line 57)
- [ ] **Step 2:** Replace:
  ```typescript
  const trigram = padded[i] + padded[i + 1] + padded[i + 2]
  ```
  With:
  ```typescript
  const trigram = padded.substring(i, i + 3)
  ```
- [ ] **Step 3:** Confirm bucket lookup and candidate deduplication logic unchanged

---

## Task 3: Trigram regression tests

**Files:**
- Test: `src/services/matchingService/__tests__/trigramIndex.test.ts`

- [ ] **Step 1:** Run trigram tests:
  ```bash
  npm test -- src/services/matchingService/__tests__/trigramIndex.test.ts
  ```
- [ ] **Step 2:** Verify key scenarios pass unchanged:
  - `'foo'` trigram set
  - Short string `'a'` and empty string
  - Index build with shared buckets
  - Query match, no-match, and multi-trigram deduplication

---

## Task 4: Full verification

- [ ] **Step 1:** Run full suite: `npm test`
- [ ] **Step 2:** Run lint: `npm run lint`
- [ ] **Step 3:** Grep `trigramIndex.ts` — confirm no `padded[i] +` concatenation remains

---

## Reference: Current vs target

| Aspect | Current | Target |
|--------|---------|--------|
| Window extraction | char concat | `substring(i, i + 3)` |
| Padding | `` `  ${normalized} ` `` | unchanged |
| Loop bounds | `0` to `len - 3` | unchanged |
| Trigram sets | baseline | identical |
| Candidate query results | baseline | identical |
| Files touched | — | `trigramIndex.ts` only |

## Out of scope

- `normalizeLIG3` / `scoringHelpers.ts`
- Trigram index structure or MatchingService orchestration
- New unit tests (existing suite covers behavior)
- Performance benchmarking
