# Deferred Sequential Drain — Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix deferred matching clique deadlock by replacing the frozen parallel Pass 2 with a per-source sequential drain that materializes anchor Fusion accounts and, on deferred match, materializes all matched pending candidates.

**Architecture:** Identity scoring stays parallel in `scoreManagedAccounts`. Deferred resolution moves to a new `runDeferredDrain` loop in `MatchOutcomeDispatcher` that scores one pending account at a time per source against a mutating `CandidateRegistry`. Persisted fusion accounts seed the pool at `initializeManagedAccountProcessing`. Registry keys prefer `originAccount` composite keys.

**Tech Stack:** TypeScript, Node.js, Vitest.

**Specs:** [`specs/matching-service/spec.md`](specs/matching-service/spec.md) (includes MatchOutcomeDispatcher outcome and deferred-drain concurrency deltas)

**Design:** [`design.md`](design.md)

---

## Task 1: CandidateRegistry tiers and seeding

**Files:**
- Modify: `src/services/matchingService/candidateRegistry.ts`
- Modify: `src/model/fusionRun.ts`
- Modify: `src/services/fusionService/fusionService.ts`
- Test: `src/services/fusionService/__tests__/candidateRegistry.test.ts`

- [ ] **Step 1:** Add `registerPersisted`, `registerAnchor`, tier tracking; `candidateKey` prefers `originAccount`; skip pending overwrite of persisted.
- [ ] **Step 2:** Wire `FusionRun.registerPersistedDeferredCandidate` / `registerAnchorDeferredCandidate`.
- [ ] **Step 3:** Seed both `fusionAccountMap` and `allFusionIdentities` in `initializeManagedAccountProcessing`.
- [ ] **Step 4:** Add registry tests; run `npm test -- candidateRegistry.test.ts`.

## Task 2: Sequential deferred drain

**Files:**
- Modify: `src/services/matchingService/matchOutcomeDispatcher.ts`
- Modify: `src/services/matchingService/matchingHelpers.ts` (remove tier heuristic if added)

- [ ] **Step 1:** Write failing clique test in `deferredEndToEnd.test.ts` (3 accounts → 1 non-match, 2 deferred).
- [ ] **Step 2:** Extract `runDeferredDrain` — per-source sorted queue, score one account, dispatch immediately.
- [ ] **Step 3:** Implement pending-candidate materialization in deferred branch (all matched pending in `fusionMatches`).
- [ ] **Step 4:** Remove Pass 1 bulk register and parallel Pass 2; identity pass unchanged.
- [ ] **Step 5:** Run `npm test -- deferredEndToEnd.test.ts matchOutcomeDispatcher.test.ts`.

## Task 3: Two-run regression and cleanup

**Files:**
- Test: `src/services/matchingService/__tests__/deferredEndToEnd.test.ts`

- [ ] **Step 1:** Add two-run scenario test with persisted non-match seed + peer cluster.
- [ ] **Step 2:** Run full `npm test` and `npm run lint`.
- [ ] **Step 3:** Manual dry-run verification with user's 36-account dataset (optional if tests cover behavior).

