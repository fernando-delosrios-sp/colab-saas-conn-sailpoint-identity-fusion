## 1. Phase Number Mismatch

- [x] 1.1 Update JSDoc comments in `corePipeline.ts` to correctly map to the actual pipeline runner phase numbers.

## 2. Centralize `RECORD_MODE` Environment Check

- [x] 2.1 Add an `isRecordMode` boolean property initialized using `process.env.RECORD_MODE === 'true'` in `fusionRun.ts`.
- [x] 2.2 Replace all scattered `process.env.RECORD_MODE` checks with the centralized property `this.run.isRecordMode` in `corePipeline.ts` and `serviceRegistry.ts`.

## 3. Inline `FusionService` Delegations

- [x] 3.1 Remove 1-line wrapper methods (`handleIdentityMatch`, `handlePartialMatch`, `handleDeferredMatch`, `handleNonMatch`, `handleExactMatch`, `handleNoReviewerAccount`, `handleNonAuthoritativeNoMatch`) in `fusionService.ts`.
- [x] 3.2 Have the internal `FusionService` callers reference `this.outcomeHandler` directly.

## 4. Remove Bottlenecks and Unused Code

- [x] 4.1 Delete the `hasEquivalentManagedAccountId` function completely from `matchingService.ts`.
- [x] 4.2 Replace the `candidates` array spread (`...accountIdsSet`, `...missingAccountIdsSet`) with direct `for` loop iterations in `identityMatchesManagedAccountKey` in `matchingService.ts`.

## 5. Deduplicate Logic

- [x] 5.1 Export `getManagedAccountSnapshotKey` from `velocityAccountSnapshot.ts`.
- [x] 5.2 Remove local duplicate functions and import the shared one in `mappingService.ts` and `definitionService.ts`.

## 6. Remove Dead Exports

- [x] 6.1 Un-export or remove `COMPOUND_KEY_UNIQUE_ID_ATTRIBUTE`, `createBatchProgressLogger`, `WEIGHTED_MEAN_ALGORITHM`, and `ManagedAccountEntry` from `constants.ts`, `collections.ts`, `matchingService.ts`, and `fusionRun.ts`.

## 7. Formatting & Readability Fixes

- [x] 7.1 Fix inconsistent indentation at `fusionService.ts:1326` and `managedAccountOutcomeHandler.ts:104`.
- [x] 7.2 Remove empty "Public Cleanup Methods" section header and dangling orphan JSDoc block in `fusionService.ts`.
- [x] 7.3 Remove `getBestAutoAssignMatch` delegation bypass in `fusionService.ts`.
- [x] 7.4 Use `COMBINED_SCORE_ROW_ATTRIBUTE` constant instead of magic strings, and remove unnecessary `(s as any)` type casting in `managedAccountOutcomeHandler.ts:196`.

## 8. Verification

- [x] 8.1 Run tests `npm test` to verify no functionality is broken.
- [x] 8.2 Run `npx tsc --noEmit` to verify type safety.
- [x] 8.3 Run `npx knip` to verify no remaining dead exports.
