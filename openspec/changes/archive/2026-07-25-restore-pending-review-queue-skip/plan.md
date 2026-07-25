# Restore Pending Review Queue Skip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore Fetch-phase and same-run work-queue depletion for managed accounts with pending Fusion review forms; harden form-definition reuse on 409 conflicts.

**Architecture:** Extend `ManagedAccountInfo` with optional `identityId`. FormService normalizes composite keys and claims via inventory when pending review. MatchOutcomeDispatcher claims after successful partial-match form creation. `getOrCreateFormDefinition` retries name lookup on duplicate create.

**Tech Stack:** TypeScript, Vitest, FusionRun, FormService, MatchOutcomeDispatcher

---

## Task 1: FusionRun inventory extension

**Files:** `src/model/fusionRun.ts`, `src/model/__tests__/fusionRun.test.ts`

- [ ] Add optional `identityId` to `ManagedAccountInfo` / `toManagedAccountInfo`
- [ ] Test inventory retains `identityId` after `setManagedAccount` + `claimAccount`

## Task 2: Fetch-phase pending-review queue depletion

**Files:** `src/services/formService/formService.ts`, `src/services/formService/__tests__/formService.test.ts`

- [ ] Normalize account ids at extraction sites
- [ ] Claim when `shouldRemoveAccountFromMap && hasManagedAccount` (queue or inventory `identityId`)
- [ ] Unit + integration-style tests for pending review claim paths

## Task 3: Form definition reuse hardening

**Files:** `src/services/formService/formService.ts`, tests

- [ ] 409 conflict recovery in `getOrCreateFormDefinition`
- [ ] Unit test for create conflict + successful name lookup

## Task 4: Partial-match same-run claim

**Files:** `src/services/matchingService/matchOutcomeDispatcher.ts`, tests

- [ ] Pass source `Account` into `handlePartialMatch`; claim on `formDefinitionReady`
- [ ] Tests for successful claim vs failed form creation

## Task 5: Verification

- [ ] Targeted Vitest run
- [ ] `npm run lint`
