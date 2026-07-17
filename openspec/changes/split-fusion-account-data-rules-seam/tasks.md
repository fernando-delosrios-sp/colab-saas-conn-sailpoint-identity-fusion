## 1. Create FusionAccountState data container

- [x] 1.1 Create `src/model/fusionAccountState.ts` with all 41 mutable fields as public properties and readonly config fields via constructor
- [x] 1.2 Move `syncCollectionAttributesToBag` method from `FusionAccount` into `FusionAccountState`, replacing `this._*` with `this.*` and `this._attributeBag` with `this.attributeBag`
- [x] 1.3 Replace `FusionAccount` private fields with single `private readonly state: FusionAccountState` field
- [x] 1.4 Update `FusionAccount` constructor to initialize `this.state` from `FusionAccount.config`
- [x] 1.5 Rewrite all accessors (getters) to delegate to `this.state` (e.g., `this._email` → `this.state.email`)
- [x] 1.6 Rewrite simple setters as pass-throughs to `this.state` (e.g., `setEmail`, `setName`, `setKey`, `enable`, `disable`, collection mutators)
- [x] 1.7 Verify: `npx tsc --noEmit`, `npx eslint "src/**/*.ts"`, `npx vitest run`

## 2. Extract construction rules

- [x] 2.1 Create `src/model/fusionAccountRules/constructionRules.ts` with four exported functions: `buildFromFusionAccount`, `buildFromIdentity`, `buildFromManagedAccount`, `buildFromFusionDecision`
- [x] 2.2 Move private builder bodies (`initializeCoreState`, `initializeSources`, `initializeAttributeState`, `markIdentityOrigin`, `setOrigin`, `restoreOriginMetadata`, `restoreIdentityLinkage`, `restorePersistedCollections`, `ensureBaselineForIdentityOrigin`) into constructionRules as private helpers operating on `FusionAccountState`
- [x] 2.3 Refactor `FusionAccount` four factory methods into thin orchestrators that delegate to construction rules
- [x] 2.4 Verify: `npx tsc --noEmit`, `npx eslint "src/**/*.ts"`, `npx vitest run`

## 3. Extract layer rules

- [x] 3.1 Create `src/model/fusionAccountRules/layerRules.ts` with three exported functions: `addIdentityLayer`, `addManagedAccountLayer`, `addFusionDecisionLayer`
- [x] 3.2 Adapt `MatchContext` inside layer rules to use `state` object directly instead of closures over `this`
- [x] 3.3 Import helpers from other rule modules (`collectionRules`, `statusRules`, `historyRules`) for MatchContext callbacks
- [x] 3.4 Refactor `FusionAccount` layer methods into thin orchestrators delegating to `FusionAccountLayerRules`
- [x] 3.5 Verify: `npx tsc --noEmit`, `npx eslint "src/**/*.ts"`, `npx vitest run`

## 4. Extract status, action, review, and correlation rules

- [x] 4.1 Create `src/model/fusionAccountRules/statusRules.ts` with `addStatus`, `removeStatus`, `hasStatus`, `setUncorrelatedAccount`, `setBaseline`, `setNonMatched`, `setManual`, `setAuthorized`, `createDecisionHistoryMessage`, `formatHistoryAccountInfo`, `normalizeHistoryLabel`, `isOrphan`, `markAsOrphan`
- [x] 4.2 Create `src/model/fusionAccountRules/actionRules.ts` with `addAction`, `removeAction`, `setSourceReviewer`, `removeSourceReviewer`, `listReviewerSources`, `actionsHasReviewerScope`
- [x] 4.3 Create `src/model/fusionAccountRules/reviewRules.ts` with `addReview`, `removeReview`, `addFusionReview`, `removeFusionReview`, `clearFusionReviews`, `addPendingReviewUrl`, `resolvePendingReviewUrls`, `resolveReviewPromises`
- [x] 4.4 Create `src/model/fusionAccountRules/correlationRules.ts` with `setCorrelatedAccount`, `addCorrelationPromise`, `resolveCorrelationPromises`, `updateCorrelationStatus`
- [x] 4.5 Refactor `FusionAccount` remaining mutators into thin orchestrators delegating to respective rule modules
- [x] 4.6 Verify: `npx tsc --noEmit`, `npx eslint "src/**/*.ts"`, `npx vitest run`

## 5. Extract history rules and finish facade

- [x] 5.1 Create `src/model/fusionAccountRules/historyRules.ts` with `addHistory`, `importHistory`, `formatHistoryAccountInfo`, `normalizeHistoryLabel`
- [x] 5.2 Remove all private helpers from `FusionAccount.ts` — only imports, static config/configure, factory methods, accessors, mutators (all delegating), `toISCAccount()`, and `buildIdentityInfo` re-export remain
- [ ] 5.3 Verify final facade contains no internal logic: `wc -l src/model/fusionAccount.ts` under ~400 lines
- [x] 5.4 Re-export `FusionAccountState` from `src/model/fusionAccountTypes.ts`
- [x] 5.5 Verify: `npx tsc --noEmit`, `npx eslint "src/**/*.ts"`, `npx vitest run`

## 6. Add contract test

- [x] 6.1 Append to `src/model/__tests__/fusionAccount.test.ts` a `FusionAccount state facade` describe block verifying that facade mutations are reflected in `state` and vice versa
- [x] 6.2 Verify new test passes: `npx vitest run src/model/__tests__/fusionAccount.test.ts -t "FusionAccount state facade"`

## 7. Final verification

- [x] 7.1 Run full lint: `npx eslint "src/**/*.ts"` — expected no errors
- [x] 7.2 Run full typecheck: `npx tsc --noEmit` — expected no errors
- [x] 7.3 Run full test suite: `npx vitest run` — expected all tests pass (989 passed / 2 skipped)
- [ ] 7.4 Confirm file size: `wc -l src/model/fusionAccount.ts src/model/fusionAccountState.ts src/model/fusionAccountRules/*.ts` — each under ~400 lines
