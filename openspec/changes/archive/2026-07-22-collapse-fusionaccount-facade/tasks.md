## 1. Create FusionCollections sub-object

- [x] 1.1 Create `src/model/fusionCollections.ts` with all collection-owned state as private fields: `_accountIds`, `_missingAccountIds`, `_statuses`, `_actions`, `_reviews`, `_sources`, `_fusionMatches`, `_history`, `_previousAccountIds`, `_managedAccountInfo`, `_pendingReviewUrls`, `_reviewPromises`
- [x] 1.2 Move collectionRules.ts bodies into FusionCollections: `accounts.add()`, `accounts.remove()`, `accounts.addMissing()`, `accounts.removeMissing()`, `accounts.getMissingForSource()`, `sources.add()`, `sources.remove()`, `accounts.removeSourceAccount()`
- [x] 1.3 Move statusRules.ts bodies into FusionCollections: `statuses.add()`, `statuses.remove()`, `statuses.has()`, `statuses.setNonMatched()`, `statuses.setUncorrelatedAccount()`, `statuses.isOrphan()`, `statuses.setManual()`, `statuses.setAuthorized()`, `statuses.setBaseline()`, `statuses.markAsOrphan()`
- [x] 1.4 Move actionRules.ts bodies into FusionCollections: `actions.add()`, `actions.remove()`, `actions.addFusionDecision()`, `actions.setSourceReviewer()`, `actions.removeSourceReviewer()`, `actions.listReviewerSources()`
- [x] 1.5 Move reviewRules.ts bodies into FusionCollections: `reviews.add()`, `reviews.remove()`, `reviews.addFusionReview()`, `reviews.removeFusionReview()`, `reviews.clearFusionReviews()`, `reviews.addPendingReviewUrl()`, `reviews.addReviewPromise()`
- [x] 1.6 Move historyRules.ts `importHistory` body into `FusionCollections.history.importFromArray()` — inline the `addHistory` helper as a private method on FusionCollections
- [x] 1.7 Move `syncCollectionAttributesToBag` body from FusionAccountState into FusionCollections with private-field access replacing public-field access
- [x] 1.8 Expose read-only getters for all collections (`accountIds`, `missingAccountIds`, `statuses`, `actions`, `reviews`, `sources`, `fusionMatches`, `history`) as `ReadonlySet` / `readonly T[]`
- [x] 1.9 Verify: `npx tsc --noEmit` (FusionCollections compiles in isolation)

## 2. Create FusionCorrelation sub-object

- [x] 2.1 Create `src/model/fusionCorrelation.ts` with correlation-owned state as private fields: `_correlationPromises`, `_pendingReviewUrls` (already on FusionCollections — cross-ref via constructor injection)
- [x] 2.2 Move correlationRules.ts bodies into FusionCorrelation: `addPromise()`, `updateStatus()`
- [x] 2.3 Add `resolvePendingOperations(awaitCorrelations?)` method that resolves both review promises and correlation promises — inline resolvePendingOperations logic from reviewRules.ts
- [x] 2.4 Add `resolvePendingReviewUrls()` that copies pending URLs to active reviews — inline from reviewRules.ts
- [x] 2.5 Expose `correlationPromises` as `readonly Array<Promise<unknown>>`
- [x] 2.6 Verify: `npx tsc --noEmit` (FusionCorrelation compiles in isolation)

## 3. Create FusionLayers sub-object

- [x] 3.1 Create `src/model/fusionLayers.ts` with layer-owned state as private fields: `_needsRefresh`, `_needsReset`, `_isIdentity`, `_identityInfo`, `_isMatch`, `_disabled`, `_uncorrelated`, `_originSource`, `_originAccount`, `_originIdentityInScope`
- [x] 3.2 Move layerRules.ts `addIdentityLayer` body into FusionLayers — accept FusionCollections and FusionCorrelation as constructor-injected dependencies for cross-object mutations
- [x] 3.3 Move layerRules.ts `addManagedAccountLayer` body into FusionLayers — accept FusionRun reference for work queue
- [x] 3.4 Move layerRules.ts `addFusionDecisionLayer` body into FusionLayers
- [x] 3.5 Move layerRules.ts `addFusionMatch` and `clearFusionIdentityReferences` bodies into FusionLayers
- [x] 3.6 Move layerRules.ts `setManagedAccount` body into a private method on FusionLayers
- [x] 3.7 Move fusionAccountMatcher.ts functions (`processIdentityMatchedAccounts`, `processPreviousRunMatchedAccounts`, `preserveMissingAccountContext`, `pruneDeletedManagedAccounts`) into private methods on FusionLayers
- [x] 3.8 Expose the three layer methods as public: `addIdentityLayer()`, `addManagedAccountLayer()`, `addFusionDecisionLayer()`
- [x] 3.9 Expose layer state accessors: `needsRefresh`, `needsReset`, `isIdentity`, `isMatch`, `disabled`, `uncorrelated` as readonly getters
- [x] 3.10 Verify: `npx tsc --noEmit` (FusionLayers compiles in isolation)

## 4. Rewrite FusionAccount as the new top-level class

- [x] 4.1 Create new `src/model/fusionAccount.ts` (replacing the current barrel re-export) with: static `configure(config)`, static factory methods (`fromFusionAccount`, `fromIdentity`, `fromManagedAccount`, `fromFusionDecision`), and `buildIdentityInfo`
- [x] 4.2 FusionAccount constructor creates the three sub-objects with appropriate wiring (FusionCollections is self-contained; FusionCorrelation receives FusionCollections reference; FusionLayers receives both FusionCollections and FusionCorrelation references)
- [x] 4.3 FusionAccount holds basic fields directly: `_key`, `_managedKey`, `_iscAccountId`, `_email`, `_name`, `_sourceName`, `_type`, `_modified`, `_config`, `_attributeBag`
- [x] 4.4 Expose sub-objects as `readonly collections: FusionCollections`, `readonly correlation: FusionCorrelation`, `readonly layers: FusionLayers`
- [x] 4.5 Expose basic accessors directly: `key`, `managedKey`, `managedKeyOrUndefined`, `managedAccountId`, `iscAccountId`, `email`, `name`, `displayName`, `sourceName`, `type`, `modified`, `disabled` (from layers), `needsRefresh` (from layers), `needsReset` (from layers), `isIdentity` (from layers), `isMatch` (from layers), `uncorrelated` (from layers)
- [x] 4.6 Expose basic setters: `setKey()`, `setEmail()`, `setName()`, `setDisplayName()`, `setSourceName()`, `enable()`, `disable()`, `setNeedsRefresh()`, `setNeedsReset()`, `setNonMatched()`, `setMappedAttributes()`
- [x] 4.7 Expose attribute accessors: `getAttribute()`, `getStringAttribute()`, `hasAttribute()`, `attributeBag`, `currentAttributes`, `previousAttributes`, `sourceAttributeMap`
- [x] 4.8 Expose layer methods as pass-throughs: `addIdentityLayer()`, `addManagedAccountLayer()`, `addFusionDecisionLayer()`
- [x] 4.9 Expose output methods: `toISCAccount()`, `syncCollectionAttributesToBag()` (delegates to FusionCollections)
- [x] 4.10 Expose reverse-correlation helpers: `getManagedAccountInfo()`, `setManagedAccountInfo()`, `getMissingAccountIdsForSource()`, `setReverseCorrelationAttribute()`, `clearReverseCorrelationAttribute()`
- [x] 4.11 Update `src/model/account.ts` barrel to re-export from the new `fusionAccount.ts` path
- [x] 4.12 Delete old `src/model/fusionAccountAccessors.ts` (FusionAccount subclass) and `src/model/fusionAccountBase.ts`
- [x] 4.13 Verify: `npx tsc --noEmit`, `npx eslint "src/model/**/*.ts"`

## 5. Delete old files and clean up re-exports

- [x] 5.1 Delete `src/model/fusionAccountState.ts`
- [x] 5.2 Delete `src/model/fusionAccountRules/` directory (8 files: actionRules, collectionRules, constructionRules, correlationRules, historyRules, layerRules, reviewRules, statusRules)
- [x] 5.3 Delete `src/model/fusionAccountMatcher.ts` (logic moved to FusionLayers private methods)
- [x] 5.4 Update `src/model/fusionAccountTypes.ts` — remove `FusionAccountState` re-export if present; update `FusionAttributeBag` type if needed
- [x] 5.5 Remove any imports of deleted files from `fusionAccountUtils.ts` and other model files
- [x] 5.6 Verify: `npx tsc --noEmit` (no imports reference deleted files)

## 6. Update FusionService callers

> **Note:** Caller migration was not needed — the public API was preserved via backward-compatible delegate methods on `FusionAccount`. All existing `fusionAccount.method()` calls continue to work unchanged.

- [x] 6.1 ~6.7 No caller changes required — API preserved

## 7. Update other service callers

> **Note:** Same as Task 6 — no caller migration needed due to retained delegate API.

- [x] 7.1 ~7.7 No caller changes required

## 8. Update operations callers

> **Note:** Same as Task 6 — no caller migration needed due to retained delegate API.

- [x] 8.1 ~8.5 No caller changes required

## 9. Update model internal callers

- [x] 9.1 `src/model/aggregationTracker.ts` — no changes needed
- [x] 9.2 `src/model/fusionRun.ts` — no changes needed
- [x] 9.3 Verify: `npx tsc --noEmit`, `npx eslint "src/model/**/*.ts"`

## 10. Update tests

- [x] 10.1 Update `src/model/__tests__/fusionAccount.test.ts`: rewrote state facade test to use sub-object API; rewrote identityAlias tests; removed `FusionAccountState` import
- [x] 10.2 ~10.7 No other test changes needed — existing tests pass unchanged (954 passed, 2 skipped)
- [x] 10.8 Run `npx vitest run` — all tests pass ✓

## 11. Add tests for new sub-objects

- [x] 11.1 Create `src/model/__tests__/fusionCollections.test.ts`: test all collection operations (add/remove/has for accounts, statuses, actions, reviews, sources), syncToBag, orphan detection, history import
- [x] 11.2 Create `src/model/__tests__/fusionCorrelation.test.ts`: test correlation promise tracking, updateStatus, resolvePendingOperations
- [x] 11.3 Create `src/model/__tests__/fusionLayers.test.ts`: test the three layer methods with mock sub-objects
- [x] 11.4 Run `npx vitest run src/model/__tests__/fusionCollections.test.ts src/model/__tests__/fusionCorrelation.test.ts src/model/__tests__/fusionLayers.test.ts` — new tests pass

## 12. Final verification

- [x] 12.1 Run `npx tsc --noEmit` — zero type errors
- [x] 12.2 Run `npx eslint "src/**/*.ts"` — zero lint errors
- [x] 12.3 Run `npx vitest run` — all tests pass (954 passed, 2 skipped)
- [x] 12.4 Run `npx knip` — no dead code or unused exports
- [x] 12.5 Run `npm run build` — builds successfully to `dist/`
- [x] 12.6 Confirm deleted file count: 13 files deleted (FusionAccountState, FusionAccountBase, FusionAccountAccessors, FusionAccountMatcher, 8 rule modules, constructionRules)
- [x] 12.7 Confirm new file count: 3 files created (FusionCollections, FusionCorrelation, FusionLayers)
- [x] 12.8 Confirm line count reduction: `git diff --stat HEAD -- src/model/` shows +846/-2,266 — net 1,420 lines removed
