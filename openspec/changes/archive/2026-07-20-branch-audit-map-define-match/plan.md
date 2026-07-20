# `map-define-match` Refactoring Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** Clean up the map-define-match logic by removing dead code, centralizing environment flags, eliminating wrapper methods, and resolving hot-path array allocations to improve readability, maintainability, and performance.

**Architecture:** Pure internal refactor of the service and pipeline layers within the existing connector constraints. No new dependencies or DB modifications.

**Tech Stack:** TypeScript, Node.js, vitest

---

## Task 1: Phase Number Mismatch

- [ ] **Step 1:** Open `src/operations/helpers/corePipeline.ts`
- [ ] **Step 2:** Locate the JSDoc comments defining phase numbers.
- [ ] **Step 3:** Update the comments to map accurately to the executed pipeline runner phase numbers.
- [ ] **Step 4:** Commit: `chore: fix phase number mismatches in pipeline comments`

## Task 2: Centralize `RECORD_MODE` Environment Check

- [ ] **Step 1:** Open `src/model/fusionRun.ts` and add `public readonly isRecordMode: boolean;` to the `FusionRun` class. Initialize it via `process.env.RECORD_MODE === 'true'` in the constructor or initialization phase.
- [ ] **Step 2:** Open `src/operations/helpers/corePipeline.ts` and replace `process.env.RECORD_MODE` with `this.run.isRecordMode`.
- [ ] **Step 3:** Open `src/services/serviceRegistry.ts` and replace `process.env.RECORD_MODE` checks with the context's `isRecordMode` property (passing from `run` or context as appropriate).
- [ ] **Step 4:** Run `npm test` to verify.
- [ ] **Step 5:** Commit: `refactor: centralize RECORD_MODE check in FusionRun context`

## Task 3: Inline `FusionService` Delegations

- [ ] **Step 1:** Open `src/services/fusionService/fusionService.ts`.
- [ ] **Step 2:** Delete wrapper methods: `handleIdentityMatch`, `handlePartialMatch`, `handleDeferredMatch`, `handleNonMatch`, `handleExactMatch`, `handleNoReviewerAccount`, `handleNonAuthoritativeNoMatch`.
- [ ] **Step 3:** Update internal methods calling these wrappers to call `this.outcomeHandler.<methodName>` instead.
- [ ] **Step 4:** Commit: `refactor: remove FusionService outcome handler delegation wrappers`

## Task 4: Remove Bottlenecks and Unused Code

- [ ] **Step 1:** Open `src/services/matchingService/matchingService.ts`.
- [ ] **Step 2:** Delete the `hasEquivalentManagedAccountId` function and its types entirely.
- [ ] **Step 3:** Find `identityMatchesManagedAccountKey`. Replace the spread iteration (`for (const accountId of [...accountIdsSet, ...missingAccountIdsSet])`) with two separate `for...of` loops, one over `accountIdsSet` and one over `missingAccountIdsSet`.
- [ ] **Step 4:** Run `npm test` to ensure match logic is unaffected.
- [ ] **Step 5:** Commit: `perf: eliminate set spreading and delete unused hasEquivalentManagedAccountId bottleneck`

## Task 5: Deduplicate Logic

- [ ] **Step 1:** Open `src/utils/velocityAccountSnapshot.ts` and add the exported function `getManagedAccountSnapshotKey(snapshot)` (or whatever it's called locally).
- [ ] **Step 2:** Open `src/services/mappingService/mappingService.ts` and replace the local version with the imported utility.
- [ ] **Step 3:** Open `src/services/definitionService/definitionService.ts` and replace the local version with the imported utility.
- [ ] **Step 4:** Commit: `refactor: deduplicate getManagedAccountSnapshotKey utility`

## Task 6: Remove Dead Exports

- [ ] **Step 1:** In `src/services/definitionService/constants.ts` (or appropriate file), remove `COMPOUND_KEY_UNIQUE_ID_ATTRIBUTE`.
- [ ] **Step 2:** In `src/services/fusionService/collections.ts`, remove `createBatchProgressLogger`.
- [ ] **Step 3:** In `src/services/matchingService/matchingService.ts`, remove `WEIGHTED_MEAN_ALGORITHM`.
- [ ] **Step 4:** In `src/model/fusionRun.ts` (or definitions), remove the unused `ManagedAccountEntry` interface.
- [ ] **Step 5:** Run `npx knip` to verify no more dead exports or missing imports.
- [ ] **Step 6:** Commit: `chore: remove unused constants and dead exports`

## Task 7: Formatting & Readability Fixes

- [ ] **Step 1:** Fix indentation at `src/services/fusionService/fusionService.ts:1326` and `src/services/matchingService/managedAccountOutcomeHandler.ts:104`.
- [ ] **Step 2:** Open `src/services/fusionService/fusionService.ts`, delete the empty "Public Cleanup Methods" header and any dangling orphan JSDoc.
- [ ] **Step 3:** In `src/services/fusionService/fusionService.ts`, remove the `getBestAutoAssignMatch` delegation bypass since it's unused.
- [ ] **Step 4:** In `src/services/matchingService/managedAccountOutcomeHandler.ts:196`, use the `COMBINED_SCORE_ROW_ATTRIBUTE` constant and remove the `(s as any)` cast.
- [ ] **Step 5:** Commit: `style: formatting and readability cleanup in services`

## Task 8: Verification

- [ ] **Step 1:** Run `npm test`
- [ ] **Step 2:** Run `npx tsc --noEmit`
- [ ] **Step 3:** Run `npm run lint` and `npx knip`
- [ ] **Step 4:** Commit: `chore: verify map-define-match refactoring`
