# Extract Account Assembly Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Extract a single `AccountAssembly` collaborator in `src/services/accountAssembly/` to unify duplicated account assembly logic across `FusionService`, `IdentityProcessor`, `DecisionProcessor`, and `ManagedAccountOutcomeHandler`.

**Architecture:** `AccountAssembly` encapsulates mode gates (`isAggregationAccountListMode`, `shouldPruneDeletedManagedAccounts`), layer absorption, Map & Define attribute processing, and blend history recording. Processors become thin orchestrators that delegate assembly to `AccountAssembly`.

**Tech Stack:** TypeScript, Node.js, Vitest, npm

---

## Task 1: Extract AccountAssembly Service

- [ ] **Step 1:** Create `src/services/accountAssembly/accountAssembly.ts` implementing `AccountAssembly` class with core methods for mode gating, layer absorption, attribute processing, and registration.
- [ ] **Step 2:** Create `src/services/accountAssembly/index.ts` barrel export.
- [ ] **Step 3:** Create unit tests in `src/services/accountAssembly/__tests__/accountAssembly.test.ts` testing mode gates, layer application, attribute processing, and pruning logic. Verify with `npm test`.

## Task 2: Refactor Processors to Use AccountAssembly

- [ ] **Step 1:** Refactor `FusionService` (`src/services/fusionService/fusionService.ts`) to instantiate and delegate account assembly to `AccountAssembly`.
- [ ] **Step 2:** Refactor `IdentityProcessor` (`src/services/fusionService/identityProcessor.ts`) to use `AccountAssembly`.
- [ ] **Step 3:** Refactor `DecisionProcessor` (`src/services/fusionService/decisionProcessor.ts`) to use `AccountAssembly`.
- [ ] **Step 4:** Refactor `ManagedAccountOutcomeHandler` (`src/services/matchingService/managedAccountOutcomeHandler.ts`) to use `AccountAssembly`.

## Task 3: Verification & Cleanup

- [ ] **Step 1:** Run full unit test suite (`npm test`) to ensure all tests pass.
- [ ] **Step 2:** Run linter (`npm run lint`) to ensure no lint or type errors exist.
