# Cheap Non-Match Path Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate `ScoreReport[]` allocation on identity-sweep non-match comparisons by adding a fast combined-score-only path in `compareFusionAccounts`, with full breakdowns materialized only when matches are stored or breakdown capture is required.

**Architecture:** Add run-scoped `_captureBreakdown` flag on `MatchingService` (set by `FusionService` at managed-account processing init). Refactor `compareFusionAccounts` into fast path (running totals only) and full path (existing behavior). On fast-path threshold pass, re-run with full breakdown to populate `FusionMatch.scores`. Deferred candidates and report-capture runs always use full path.

**Tech Stack:** TypeScript, Node.js, Vitest

**Change artifacts:** `openspec/changes/cheap-non-match-path/` (proposal, design, specs, tasks)

---

## Task 1: Add captureBreakdown state to MatchingService

**Files:**
- Modify: `src/services/matchingService/matchingService.ts`

- [ ] **Step 1:** Add field and setter near other private members:
  ```ts
  private _captureBreakdown = false

  /** Run-scoped flag: when true, identity-sweep comparisons always build full score breakdowns (report capture). */
  public setCaptureBreakdown(value: boolean): void {
      this._captureBreakdown = value
  }
  ```
- [ ] **Step 2:** In `scoreFusionAccount`, before the identity loop, add:
  ```ts
  const captureBreakdown = this._captureBreakdown || candidateType !== MatchCandidateType.Identity
  ```
- [ ] **Step 3:** Pass `captureBreakdown` to `compareFusionAccounts` call (~line 301)
- [ ] **Step 4:** Run `npm run typecheck`

---

## Task 2: Refactor compareFusionAccounts signature

**Files:**
- Modify: `src/services/matchingService/matchingService.ts`

- [ ] **Step 1:** Update signature:
  ```ts
  private compareFusionAccounts(
      fusionAccount: FusionAccount,
      fusionIdentity: FusionAccount,
      candidateType: MatchCandidateType,
      captureBreakdown: boolean
  ): void
  ```
- [ ] **Step 2:** Extract current method body into a private helper or inline branch — start by wrapping existing logic in `if (captureBreakdown) { ... existing ... return }`
- [ ] **Step 3:** Run `npm run typecheck` (tests should still pass — default path unchanged when captureBreakdown true)

---

## Task 3: Implement fast-path scoring loop

**Files:**
- Modify: `src/services/matchingService/matchingService.ts`

- [ ] **Step 1:** After fast-path guard, initialize:
  ```ts
  let hasFailedMandatory = false
  let weightedSum = 0
  let weightTotal = 0
  ```
- [ ] **Step 2:** Mirror the existing for-loop pre-checks (skip-for-missing, LIG3 upper bound) but in fast branch:
  - For skip-for-missing: `continue` without pushing to scores
  - For LIG3 upper bound fail: set `hasFailedMandatory` if mandatory, `break` — no ScoreReport
  - For scoring: call same scorers (`scoreLIG3Normalized`, `scoreNameMatcherNormalized`, `scoreAttribute`) but only read `scoreReport.isMatch`, `scoreReport.skipped`, `scoreReport.score`, `scoreReport.fusionScore` for totals — do not push to array
  - Apply `effectiveSkipMatchIfThresholdNotMet` logic inline (treat below-threshold as skipped for weight purposes)
- [ ] **Step 3:** Preserve mandatory-fail and max-achievable early exits using same conditions as full path
- [ ] **Step 4:** Compute `combinedScore`, `combinedPasses` identically to full path
- [ ] **Step 5:** If `!combinedPasses`, return immediately (no allocation)
- [ ] **Step 6:** If `combinedPasses`, call self with `captureBreakdown = true` and return (or extract shared full-path invocation)
- [ ] **Step 7:** Run existing matching service tests

---

## Task 4: Ensure full path unchanged

**Files:**
- Modify: `src/services/matchingService/matchingService.ts`

- [ ] **Step 1:** Verify full path retains:
  - All `scores.push` including skipped-report padding on mandatory fail and max-achievable exit
  - `weightedScore` loop (lines 497-503)
  - `combinedReport` push and `fusionAccount.addFusionMatch` on `combinedPasses`
- [ ] **Step 2:** Guard against infinite recursion: full path must not re-enter fast path when called from fast-path re-run
- [ ] **Step 3:** Run `npm test -- src/services/matchingService`

---

## Task 5: Wire FusionService initialization

**Files:**
- Modify: `src/services/fusionService/fusionService.ts`

- [ ] **Step 1:** At end of `initializeManagedAccountProcessing` (~after `buildTrigramIndex`), add:
  ```ts
  this.matchingService.setCaptureBreakdown(this.shouldCaptureReportData)
  ```
- [ ] **Step 2:** Run `npm run typecheck`
- [ ] **Step 3:** Run fusion service tests touching managed account init if any exist

---

## Task 6: Add regression tests

**Files:**
- Modify: `src/services/matchingService/__tests__/matchingService.test.ts` (or `matchService.test.ts` if that's where scoring tests live)

- [ ] **Step 1:** Add `describe('compareFusionAccounts fast path')` block
- [ ] **Step 2:** Test non-match with `setCaptureBreakdown(false)`:
  - Create service with matching configs where account clearly won't match
  - Call `scoreFusionAccount` with identity pool
  - Assert `fusionAccount.fusionMatchesRaw.length === 0`
- [ ] **Step 3:** Test match with fast path:
  - Account that should match an identity
  - Assert match stored with `scores.length > 0` and combined row present
- [ ] **Step 4:** Run `npm test -- src/services/matchingService`

---

## Task 7: Final verification

- [ ] **Step 1:** Run `npm run lint`
- [ ] **Step 2:** Run full `npm test`
- [ ] **Step 3:** Confirm no changes to `scoringHelpers.ts`, `types.ts`, or `matchOutcomeDispatcher.ts`

---

## Reference: Current vs target

| Aspect | Current | Target |
|--------|---------|--------|
| Non-match identity comparison | Full `ScoreReport[]` allocated, discarded | Running totals only; no array |
| Threshold-passing comparison | Single pass with breakdown | Fast pass → re-run full path for breakdown |
| Report capture runs | Full breakdown always | Unchanged (`captureBreakdown = true`) |
| Deferred candidates | Full breakdown always | Unchanged (type guard forces full path) |

## Out of scope

- `scoringHelpers.ts`, `types.ts`, `MatchOutcomeDispatcher`
- Memory profiling in CI
- Scoring concurrency changes (separate change)
