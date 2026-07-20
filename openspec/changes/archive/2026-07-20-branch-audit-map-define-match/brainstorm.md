<!--
Raw capture of superpowers:brainstorming output.

本檔原樣捕捉 brainstorming skill 的產出，不強制結構。
Skill 的自然產出通常是 decision log 格式（背景 → 決議鏈 Q1-Qn → 設計取捨），
但依對話內容可能有不同組織方式。

design.md 從本檔萃取並重新整理為結構化設計文件。

不要將本檔的內容複製到 design.md — design.md 是獨立的重組產物，
兩者互補但不重疊。
-->

# Branch Audit: `map-define-match` — Readability, Maintainability & Performance

**Branch**: `map-define-match` at `b71aaa9`  
**Scope**: 749 changed files (entire branch diff vs `main`)  
**Focus**: Code readability, maintainability, operation performance  
**Verification**: `tsc --noEmit` ✅ | `vitest run` 933/933 ✅ | `eslint` ✅ | `knip` 4 issues

Based on feedback, the following decisions were made:

### 1. Fix Phase Number Mismatch
Update JSDoc comments to correctly map to the actual pipeline runner phase numbers in `corePipeline.ts`.

### 2. Centralize `RECORD_MODE` Environment Check
Add an `isRecordMode` boolean property initialized using `process.env.RECORD_MODE === 'true'` in `fusionRun.ts`.
Replace all scattered `process.env.RECORD_MODE` checks with the centralized property `this.run.isRecordMode` (or equivalent context path) in `corePipeline.ts` and `serviceRegistry.ts`.

### 3. Inline `FusionService` Delegations
Remove the 1-line wrapper methods (`handleIdentityMatch`, `handlePartialMatch`, `handleDeferredMatch`, `handleNonMatch`, `handleExactMatch`, `handleNoReviewerAccount`, `handleNonAuthoritativeNoMatch`) in `fusionService.ts`. Have the internal `FusionService` callers reference `this.outcomeHandler` directly.

### 4. Remove `hasEquivalentManagedAccountId` Bottleneck
Delete this function from `matchingService.ts` entirely as it is unused dead code and previously identified as a bottleneck.

### 5. Eliminate Set Spreading in `identityMatchesManagedAccountKey`
Replace the `candidates` array (which spreads `accountIdsSet` and `missingAccountIdsSet`) with direct `for` loop iterations in `matchingService.ts` to prevent O(n) array allocations on every invocation in a hot path.

### 6. Deduplicate `getManagedAccountSnapshotKey`
Export the common function in `velocityAccountSnapshot.ts`.
Remove local duplicated functions and import the shared one in `mappingService.ts` and `definitionService.ts`.

### 7. Remove Dead Exports
Un-export or remove `COMPOUND_KEY_UNIQUE_ID_ATTRIBUTE`, `createBatchProgressLogger`, `WEIGHTED_MEAN_ALGORITHM`, and the unused `ManagedAccountEntry` interface from `constants.ts`, `collections.ts`, `matchingService.ts`, and `fusionRun.ts`.

### 8. Formatting & Readability Fixes
- Fix inconsistent indentation at `fusionService.ts:1326` and `managedAccountOutcomeHandler.ts:104`.
- Remove empty "Public Cleanup Methods" section header in `fusionService.ts`.
- Remove dangling orphan JSDoc block in `fusionService.ts`.
- Remove `getBestAutoAssignMatch` delegation bypass in `fusionService.ts` since it's unused there.
- Use `COMBINED_SCORE_ROW_ATTRIBUTE` constant instead of magic strings, and remove unnecessary `(s as any)` type casting in `managedAccountOutcomeHandler.ts:196`.
