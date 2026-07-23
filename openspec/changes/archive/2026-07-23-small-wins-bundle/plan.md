# Small Wins Bundle Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bundle three low-risk improvements — Jaro typed-array match flags, full-scan trigram fallback observability, and non-copying fusion account iteration.

**Architecture:** Part A is a localized change in `jaroSimilarity`. Part B adds run-scoped counter on `FusionRun`, optional logging in `getCandidates`, caller update in `matchOutcomeDispatcher`, and epilogue summary. Part C adds a generator on `FusionRun` and switches iteration-only loops in fusion service layers. No external API or config changes.

**Tech Stack:** TypeScript, Node.js, Vitest

**Change artifacts:** `openspec/changes/small-wins-bundle/` (proposal, design, specs, tasks)

---

## Task 1: Jaro Uint8Array match flags

**Files:**
- Modify: `src/services/matchingService/stringComparison.ts`
- Test: `src/services/matchingService/__tests__/stringComparison.test.ts`

- [ ] **Step 1:** Open `jaroSimilarity` (~line 42)
- [ ] **Step 2:** Replace:
  ```typescript
  const s1Matches = new Array(len1).fill(false)
  const s2Matches = new Array(len2).fill(false)
  ```
  With:
  ```typescript
  const s1Matches = new Uint8Array(len1)
  const s2Matches = new Uint8Array(len2)
  ```
- [ ] **Step 3:** Replace assignments `s1Matches[i] = true` / `s2Matches[j] = true` with `= 1`
- [ ] **Step 4:** Confirm `if (s2Matches[j])`, `if (!s1Matches[i])`, `while (!s2Matches[k])` still work (0 is falsy, 1 is truthy)
- [ ] **Step 5:** Run:
  ```bash
  npm test -- src/services/matchingService/__tests__/stringComparison.test.ts
  ```

---

## Task 2: FusionRun fallback counter and iterable

**Files:**
- Modify: `src/model/fusionRun.ts`

- [ ] **Step 1:** Add field near other run metrics:
  ```typescript
  fullScanFallbackCount: number = 0
  ```
- [ ] **Step 2:** Add generator after `allFusionAccounts` getter:
  ```typescript
  *fusionAccountsIterable(): Iterable<FusionAccount> {
      yield* this._fusionAccountMap.values()
  }
  ```
- [ ] **Step 3:** Add JSDoc on both new surface areas
- [ ] **Step 4:** Run `npx tsc --noEmit`

---

## Task 3: getCandidates fallback tracking

**Files:**
- Modify: `src/services/matchingService/matchingService.ts`
- Modify: `src/services/matchingService/matchOutcomeDispatcher.ts`

- [ ] **Step 1:** Import `LogService` if not already present in matchingService
- [ ] **Step 2:** Update signature:
  ```typescript
  public getCandidates(
      account: FusionAccount,
      log?: LogService,
      excludeIds?: ReadonlySet<string>
  ): Set<FusionAccount> | undefined
  ```
- [ ] **Step 3:** At `if (resultSet === undefined)` block (~line 249) after mandatory-attribute loop, before comment about full scan:
  ```typescript
  if (this.run) {
      this.run.fullScanFallbackCount = (this.run.fullScanFallbackCount ?? 0) + 1
      const fallbackCount = this.run.fullScanFallbackCount
      if (log && (fallbackCount <= 5 || fallbackCount % 100 === 0)) {
          log.warn(
              `Full identity scan fallback #${fallbackCount}: account has no value for any mandatory trigram attribute`
          )
      }
  }
  ```
- [ ] **Step 4:** Update `matchOutcomeDispatcher.ts` caller:
  ```typescript
  const candidateSet = matchingService.getCandidates(fusionAccount, this.deps.log, excludeIds)
  ```
- [ ] **Step 5:** Grep for other `getCandidates(` call sites and update argument order if any exist

---

## Task 4: Full-scan fallback test

**Files:**
- Modify or create test under `src/services/matchingService/__tests__/`

- [ ] **Step 1:** Add test with built trigram index and account missing all mandatory attribute values
- [ ] **Step 2:** Assert `getCandidates` returns `undefined`
- [ ] **Step 3:** Assert `run.fullScanFallbackCount === 1`
- [ ] **Step 4:** Assert unbuilt index path does NOT increment counter

---

## Task 5: Epilogue summary warning

**Files:**
- Modify: `src/operations/helpers/accountListHelpers.ts` or `accountListPhases.ts`

- [ ] **Step 1:** Locate `buildTerminalSummary` or epilogue path that logs run-level warnings
- [ ] **Step 2:** When `serviceRegistry` exposes run and `run.fullScanFallbackCount > 0`, include warning:
  ```typescript
  log.warn(`Full identity scan fallback: ${run.fullScanFallbackCount} account(s) — trigram blocking was ineffective`)
  ```
- [ ] **Step 3:** Confirm warning appears once per aggregation run, not per account

---

## Task 6: Switch iteration-only callers

**Files:**
- Modify: `src/services/fusionService/fusionService.ts` (~683)
- Modify: `src/services/fusionService/decisionProcessor.ts` (~55)

- [ ] **Step 1:** Replace `for (const fa of this.run.allFusionAccounts)` with `for (const fa of this.run.fusionAccountsIterable())` in fusionService
- [ ] **Step 2:** Same replacement in decisionProcessor
- [ ] **Step 3:** Do NOT change spread sites: `[...this.run.allFusionAccounts, ...]`

---

## Task 7: Full verification

- [ ] **Step 1:** `npx tsc --noEmit`
- [ ] **Step 2:** `npm test`
- [ ] **Step 3:** `npm run lint`
- [ ] **Step 4:** Grep confirms no remaining `new Array(len).fill(false)` in `jaroSimilarity`

---

## Reference: Caller audit for Part C

| Location | Pattern | Action |
|----------|---------|--------|
| `fusionService.ts:683` | `for (... allFusionAccounts)` | → `fusionAccountsIterable()` |
| `decisionProcessor.ts:55` | `for (... allFusionAccounts)` | → `fusionAccountsIterable()` |
| `fusionService.ts:848,870,1026` | spread into array | keep `allFusionAccounts` |
| `matchOutcomeDispatcher.ts:428` | spread | keep |
| `accountListPhases.ts:202` | passes array to helper | keep (may need copy) |

## Out of scope

- Trigram window substring optimization (separate change)
- Changing `fusionMatches` getter
- Required `log` on `getCandidates`
- Performance benchmarks
