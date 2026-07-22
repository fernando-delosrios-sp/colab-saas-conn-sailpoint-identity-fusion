## 1. Expose mode gates on AccountAssembly

- [x] 1.1 Change `isAggregationAccountListMode()` from `private` to `public` in `src/services/accountAssembly/accountAssembly.ts`
- [x] 1.2 Change `shouldPruneDeletedManagedAccounts()` from `private` to `public` in `src/services/accountAssembly/accountAssembly.ts`
- [x] 1.3 Verify: `npx tsc --noEmit` (AccountAssembly compiles; public API change has no downstream breakage until callers update)

## 2. Remove duplicated methods from FusionService

- [x] 2.1 Replace `this.isAggregationAccountListMode()` at L132 with `this.accountAssembly.isAggregationAccountListMode()`
- [x] 2.2 Replace `this.isAggregationAccountListMode()` at L177 with `this.accountAssembly.isAggregationAccountListMode()`
- [x] 2.3 Replace `this.isAggregationAccountListMode()` at L216 (inside `shouldCaptureManagedAccountReportData()`) with `this.accountAssembly.isAggregationAccountListMode()`
- [x] 2.4 Delete `isAggregationAccountListMode()` method (L202–207)
- [x] 2.5 Delete `shouldPruneDeletedManagedAccounts()` method (L1063–1071) — dead code, zero callers
- [x] 2.6 Verify: `npx tsc --noEmit` (FusionService compiles; no downstream breakage)

## 3. Remove duplicated method from DecisionProcessor

- [x] 3.1 Replace `this.isAggregationAccountListMode()` at `resolveIdentityBestEffort` (L267) with `this.deps.accountAssembly.isAggregationAccountListMode()`
- [x] 3.2 Delete `isAggregationAccountListMode()` method (L39–44)
- [x] 3.3 Remove unused `commandType` and `operationContext` constructor parameters and fields (they only powered the deleted method)
- [x] 3.4 Update `DecisionProcessorDeps` interface — remove `commandType` and `operationContext` if present
- [x] 3.5 Update callers that construct `DecisionProcessor` to stop passing `commandType` and `operationContext`
- [x] 3.6 Verify: `npx tsc --noEmit` (DecisionProcessor and all callers compile)

## 4. Remove duplicated method from MatchOutcomeDispatcher

- [x] 4.1 Replace `this.isAggregationAccountListMode()` at `dispatchOutcome` (L462) with `this.deps.accountAssembly.isAggregationAccountListMode()`
- [x] 4.2 Delete `isAggregationAccountListMode()` method (L238–243)
- [x] 4.3 Verify: `npx tsc --noEmit` (MatchOutcomeDispatcher compiles)

## 5. Final verification

- [x] 5.1 Run `npx tsc --noEmit` — zero type errors
- [x] 5.2 Run `npx eslint "src/**/*.ts"` — zero lint errors
- [x] 5.3 Run `npx vitest run` — all tests pass
- [x] 5.4 Run `npm run build` — builds successfully to `dist/`
