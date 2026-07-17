# Split FusionAccount along the data/rules seam

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the 1,694-line `FusionAccount` god-class into a `FusionAccountState` data container and a set of `FusionAccount*Rules` modules, so readers can reason about state separately from behavior.

**Architecture:** Keep `FusionAccount` as a thin public-API facade. Move all mutable state into `FusionAccountState`. Move construction, layer, status/action, review, correlation, and history logic into focused rule modules under `src/model/`. No public API changes, no behavior changes.

---

## Global Constraints

- Prettier config: `printWidth: 120`, `tabWidth: 4`, `semi: false`, `singleQuote: true`.
- Do not change the public API of `FusionAccount` (factory methods, accessors, mutators, method signatures).
- Do not change behavior. If a characterization test from plan 002 fails, the refactor is wrong.
- Do not change callers outside `src/model` in this plan.
- Do not rename the `FusionAttribute.Accounts` / `missing-accounts` keys in this plan (that is plan 004).
- Verify with `npx eslint "src/**/*.ts"`, `npx tsc --noEmit`, and `npx vitest run` after every task.

---

## Out-of-scope file list

These files are referenced by the rules but must not be modified:
- `src/model/fusionAccountMatcher.ts`
- `src/model/fusionAccountUtils.ts`
- `src/model/fusionAccountTypes.ts` (except for re-exporting `FusionAccountState` if needed)
- `src/services/fusionService/*.ts`
- `src/operations/**/*.ts`
- `src/model/__tests__/fusionAccount.test.ts` (except for the one contract test added in Task 6)

---

## Task 1: Create `FusionAccountState`

- [ ] **Step 1: Create the state class** — `src/model/fusionAccountState.ts` with all 41 fields as public properties, readonly config fields initialized via constructor
- [ ] **Step 2: Move `syncCollectionAttributesToBag`** into `FusionAccountState` — replace `this._*` with `this.*` and `this._attributeBag` with `this.attributeBag`
- [ ] **Step 3: Replace private fields** in `FusionAccount.ts` with single `private readonly state: FusionAccountState`
- [ ] **Step 4: Update constructor** to initialize `this.state` from `FusionAccount.config`
- [ ] **Step 5: Rewrite accessors** — change `this._foo` to `this.state.foo` in all getters
- [ ] **Step 6: Rewrite setters** — simple setters (`setEmail`, `setName`, `setKey`, `enable`, `disable`, collection mutators, `setMappedAttributes`, `setNeedsRefresh`, `setNeedsReset`, `setIdentityIdAttribute`) become pass-throughs to `this.state`
- [ ] **Step 7: Verify** — `npx tsc --noEmit` && `npx eslint "src/**/*.ts"` && `npx vitest run`

---

## Task 2: Extract construction rules

- [ ] **Step 1: Create `src/model/fusionAccountRules/constructionRules.ts`** with four exported functions operating on `FusionAccountState`
- [ ] **Step 2: Move private builders** (`initializeCoreState`, `initializeSources`, `initializeAttributeState`, `markIdentityOrigin`, `setOrigin`, `restoreOriginMetadata`, `restoreIdentityLinkage`, `restorePersistedCollections`, `ensureBaselineForIdentityOrigin`) as private helpers in constructionRules
- [ ] **Step 3: Refactor factory methods** in `FusionAccount` into thin orchestrators:
  ```typescript
  public static fromFusionAccount(account: Account): FusionAccount {
      const fusionAccount = new FusionAccount()
      FusionAccountConstructionRules.buildFromFusionAccount(account, fusionAccount.state)
      return fusionAccount
  }
  ```
- [ ] **Step 4: Verify** — `npx tsc --noEmit` && `npx eslint "src/**/*.ts"` && `npx vitest run`

---

## Task 3: Extract layer rules

- [ ] **Step 1: Create `src/model/fusionAccountRules/layerRules.ts`** with `addIdentityLayer`, `addManagedAccountLayer`, `addFusionDecisionLayer`
- [ ] **Step 2: Adapt `MatchContext`** inside layer rules to use `state` object directly instead of closures over `this`:
  ```typescript
  const ctx: MatchContext = {
      identityId: state.identityInfo?.id,
      previousAccountIds: state.previousAccountIds,
      missingAccountIdsSet: state.missingAccountIds,
      accountIdsSet: state.accountIds,
      setCorrelatedAccount: (id: string) => {
          FusionAccountCollectionRules.addAccountId(state, id)
          FusionAccountCollectionRules.removeMissingAccountId(state, id)
      },
      setUncorrelatedAccount: (id: string) => FusionAccountStatusRules.setUncorrelatedAccount(state, id),
      addHistory: (message) => FusionAccountHistoryRules.addHistory(state, message),
      // ... other callbacks
  }
  ```
- [ ] **Step 3: Refactor layer methods** into thin orchestrators delegating to `FusionAccountLayerRules`
- [ ] **Step 4: Verify** — `npx tsc --noEmit` && `npx eslint "src/**/*.ts"` && `npx vitest run`

---

## Task 4: Extract status, action, review, and correlation rules

- [ ] **Step 1: Create `statusRules.ts`** — `addStatus`, `removeStatus`, `hasStatus`, `setUncorrelatedAccount`, `setBaseline`, `setNonMatched`, `setManual`, `setAuthorized`, `createDecisionHistoryMessage`, `formatHistoryAccountInfo`, `normalizeHistoryLabel`, `isOrphan`, `markAsOrphan`, `updateCorrelationStatus` (status half)
- [ ] **Step 2: Create `actionRules.ts`** — `addAction`, `removeAction`, `setSourceReviewer`, `removeSourceReviewer`, `listReviewerSources`, `actionsHasReviewerScope`
- [ ] **Step 3: Create `reviewRules.ts`** — `addReview`, `removeReview`, `addFusionReview`, `removeFusionReview`, `clearFusionReviews`, `addPendingReviewUrl`, `resolvePendingReviewUrls`, `resolveReviewPromises`, `resolvePendingOperations` (review part)
- [ ] **Step 4: Create `correlationRules.ts`** — `setCorrelatedAccount`, `addCorrelationPromise`, `resolveCorrelationPromises`, `updateCorrelationStatus` (action/uncorrelated half)
- [ ] **Step 5: Refactor mutators** — each remaining public method on `FusionAccount` delegates to corresponding rule function
- [ ] **Step 6: Verify** — `npx tsc --noEmit` && `npx eslint "src/**/*.ts"` && `npx vitest run`

---

## Task 5: Extract history rules and finish the facade

- [ ] **Step 1: Create `historyRules.ts`** — `addHistory`, `importHistory`, `formatHistoryAccountInfo`, `normalizeHistoryLabel`
- [ ] **Step 2: Remove all private helpers** from `FusionAccount.ts` — only imports, static config/configure, factory methods, accessors, mutators (all delegating), `toISCAccount()`, and `buildIdentityInfo` re-export remain
- [ ] **Step 3: Verify facade shape** — `wc -l src/model/fusionAccount.ts` under ~400 lines; no internals
- [ ] **Step 4: Re-export `FusionAccountState`** from `src/model/fusionAccountTypes.ts`
- [ ] **Step 5: Verify** — `npx tsc --noEmit` && `npx eslint "src/**/*.ts"` && `npx vitest run`

---

## Task 6: Add a contract test for the state facade

- [ ] **Step 1: Add contract test** to `src/model/__tests__/fusionAccount.test.ts`:
  ```typescript
  describe('FusionAccount state facade', () => {
      it('exposes the same mutable state through the facade as through the state object', () => {
          const acc = FusionAccount.fromIdentity({ id: 'id-1' } as any)
          const state = (acc as any).state as FusionAccountState

          acc.addAccountId('src-a::native-1')
          expect(state.accountIds.has('src-a::native-1')).toBe(true)
          expect(acc.accountIds).toContain('src-a::native-1')

          acc.addStatus('test-status')
          expect(state.statuses.has('test-status')).toBe(true)
          expect(acc.statuses).toContain('test-status')

          acc.setCorrelatedAccount('src-a::native-1')
          expect(state.accountIds.has('src-a::native-1')).toBe(true)
          expect(state.missingAccountIds.has('src-a::native-1')).toBe(false)
      })
  })
  ```
- [ ] **Step 2: Run** — `npx vitest run src/model/__tests__/fusionAccount.test.ts -t "FusionAccount state facade"` — expected PASS

---

## Task 7: Final verification

- [ ] **Step 1: Full lint** — `npx eslint "src/**/*.ts"` — expected no errors
- [ ] **Step 2: Full typecheck** — `npx tsc --noEmit` — expected no errors
- [ ] **Step 3: Full test suite** — `npx vitest run` — expected all tests pass
- [ ] **Step 4: File size check** — `wc -l src/model/fusionAccount.ts src/model/fusionAccountState.ts src/model/fusionAccountRules/*.ts` — each under ~400 lines

---

## Final file layout

```
src/model/
  fusionAccount.ts
  fusionAccountState.ts
  fusionAccountRules/
    collectionRules.ts
    constructionRules.ts
    layerRules.ts
    statusRules.ts
    actionRules.ts
    reviewRules.ts
    correlationRules.ts
    historyRules.ts
```

`fusionAccount.ts` imports each rule namespace explicitly — no barrel file.

---

## Escape Hatches

**STOP and report back if:**
- Any characterization test from plan 002 fails after a refactor step.
- The `MatchContext` cannot be adapted without changing `fusionAccountMatcher.ts`.
- Any caller outside `src/model` needs to change to satisfy the compiler.
- The final `FusionAccount.ts` still exceeds 500 lines.
