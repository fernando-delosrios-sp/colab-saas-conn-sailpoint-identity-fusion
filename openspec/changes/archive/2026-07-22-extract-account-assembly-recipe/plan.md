# One account-assembly recipe behind the processors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove 4 duplicated copies of `isAggregationAccountListMode()` and `shouldPruneDeletedManagedAccounts()` from FusionService, DecisionProcessor, and MatchOutcomeDispatcher, delegating all call sites to the canonical `AccountAssembly` collaborator.

**Architecture:** Expose two methods (`isAggregationAccountListMode`, `shouldPruneDeletedManagedAccounts`) as public on `AccountAssembly`. Replace 6 call sites across 3 files with delegate calls. Delete the 4 duplicated method definitions and remove unused constructor state from DecisionProcessor.

**Tech Stack:** TypeScript (strict), Vitest, npm

## Global Constraints

- Zero behavioral changes — pure structural de-duplication
- `npx tsc --noEmit` must pass after each task
- `npx vitest run` must pass with all tests at final verification
- Follow existing code conventions: 4-space tabs, single quotes, no semicolons

---

### Task 1: Expose mode gates on AccountAssembly

**Files:**
- Modify: `src/services/accountAssembly/accountAssembly.ts:42,49`

**Interfaces:**
- Produces: `AccountAssembly.isAggregationAccountListMode(): boolean` (public), `AccountAssembly.shouldPruneDeletedManagedAccounts(): boolean` (public)

- [ ] **Step 1: Change `isAggregationAccountListMode()` from `private` to `public`**

In `src/services/accountAssembly/accountAssembly.ts`, change line 42:
```typescript
private isAggregationAccountListMode(): boolean {
```
to:
```typescript
public isAggregationAccountListMode(): boolean {
```

- [ ] **Step 2: Change `shouldPruneDeletedManagedAccounts()` from `private` to `public`**

In `src/services/accountAssembly/accountAssembly.ts`, change line 49:
```typescript
private shouldPruneDeletedManagedAccounts(): boolean {
```
to:
```typescript
public shouldPruneDeletedManagedAccounts(): boolean {
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (AccountAssembly compiles with public API)

- [ ] **Step 4: Commit**

```bash
git add src/services/accountAssembly/accountAssembly.ts
git commit -m "feat: expose isAggregationAccountListMode and shouldPruneDeletedManagedAccounts as public on AccountAssembly"
```

---

### Task 2: Remove duplicated methods from FusionService

**Files:**
- Modify: `src/services/fusionService/fusionService.ts:132,177,202-207,216,1063-1071`

**Interfaces:**
- Consumes: `AccountAssembly.isAggregationAccountListMode(): boolean`
- Consumes: `AccountAssembly.shouldPruneDeletedManagedAccounts(): boolean`

- [ ] **Step 1: Replace internal call at constructor (L132)**

In `src/services/fusionService/fusionService.ts`, find the callback or expression at L132 that calls `this.isAggregationAccountListMode()`. Replace with `this.accountAssembly.isAggregationAccountListMode()`.

- [ ] **Step 2: Replace internal call at constructor (L177)**

At L177, replace `this.isAggregationAccountListMode()` with `this.accountAssembly.isAggregationAccountListMode()`.

- [ ] **Step 3: Replace internal call in `shouldCaptureManagedAccountReportData` (L216)**

At L216, replace `this.isAggregationAccountListMode()` with `this.accountAssembly.isAggregationAccountListMode()`.

- [ ] **Step 4: Delete `isAggregationAccountListMode()` method (L202-207)**

Remove the entire method definition (lines 202-207):
```typescript
public isAggregationAccountListMode(): boolean {
    return (
        this.commandType === StandardCommand.StdAccountList ||
        this.operationContext === OperationContext.AccountList
    )
}
```

- [ ] **Step 5: Delete `shouldPruneDeletedManagedAccounts()` method (L1063-1071)**

Remove the entire method definition (lines 1063-1071):
```typescript
public shouldPruneDeletedManagedAccounts(): boolean {
    return (
        this.isAggregationAccountListMode() ||
        this.commandType === StandardCommand.StdAccountRead ||
        this.commandType === StandardCommand.StdAccountUpdate ||
        this.commandType === StandardCommand.StdAccountEnable ||
        this.commandType === StandardCommand.StdAccountDisable
    )
}
```

- [ ] **Step 6: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS with zero type errors

- [ ] **Step 7: Commit**

```bash
git add src/services/fusionService/fusionService.ts
git commit -m "refactor: delegate mode-gate methods to AccountAssembly in FusionService"
```

---

### Task 3: Remove duplicated method from DecisionProcessor

**Files:**
- Modify: `src/services/fusionService/decisionProcessor.ts:35-44,267`

**Interfaces:**
- Consumes: `AccountAssembly.isAggregationAccountListMode(): boolean`

- [ ] **Step 1: Replace call in `resolveIdentityBestEffort` (L267)**

In `src/services/fusionService/decisionProcessor.ts`, change:
```typescript
return this.isAggregationAccountListMode() ? this.deps.identities.fetchIdentityById(identityId) : undefined
```
to:
```typescript
return this.deps.accountAssembly.isAggregationAccountListMode() ? this.deps.identities.fetchIdentityById(identityId) : undefined
```

- [ ] **Step 2: Delete `isAggregationAccountListMode()` method (L39-44)**

Remove the method definition:
```typescript
private isAggregationAccountListMode(): boolean {
    return (
        this.commandType === StandardCommand.StdAccountList ||
        this.operationContext === OperationContext.AccountList
    )
}
```

- [ ] **Step 3: Remove unused `commandType` and `operationContext` constructor params**

If these two params were only used by the deleted `isAggregationAccountListMode()`, remove them from:
- The constructor parameter list
- The class field declarations
- The `DecisionProcessorDeps` interface (if they live there)

**Note**: Check whether `commandType` or `operationContext` are used elsewhere in DecisionProcessor. If they are, keep them. Only remove them if their sole purpose was powering the deleted method.

- [ ] **Step 4: Update callers that construct DecisionProcessor**

Use `npx tsc --noEmit` to find any callers passing `commandType`/`operationContext` that no longer exist in the constructor signature. Remove those arguments from the constructor call sites.

- [ ] **Step 5: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS with zero type errors

- [ ] **Step 6: Commit**

```bash
git add src/services/fusionService/decisionProcessor.ts
git commit -m "refactor: delegate isAggregationAccountListMode to AccountAssembly in DecisionProcessor"
```

---

### Task 4: Remove duplicated method from MatchOutcomeDispatcher

**Files:**
- Modify: `src/services/matchingService/matchOutcomeDispatcher.ts:238-243,462`

**Interfaces:**
- Consumes: `AccountAssembly.isAggregationAccountListMode(): boolean`

- [ ] **Step 1: Replace call in `dispatchOutcome` (L462)**

In `src/services/matchingService/matchOutcomeDispatcher.ts`, change:
```typescript
if (!this.isAggregationAccountListMode()) {
```
to:
```typescript
if (!this.deps.accountAssembly.isAggregationAccountListMode()) {
```

- [ ] **Step 2: Delete `isAggregationAccountListMode()` method (L238-243)**

Remove the method definition:
```typescript
private isAggregationAccountListMode(): boolean {
    return (
        this.deps.commandType === StandardCommand.StdAccountList ||
        this.deps.operationContext === OperationContext.AccountList
    )
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS with zero type errors

- [ ] **Step 4: Commit**

```bash
git add src/services/matchingService/matchOutcomeDispatcher.ts
git commit -m "refactor: delegate isAggregationAccountListMode to AccountAssembly in MatchOutcomeDispatcher"
```

---

### Task 5: Final verification

**Files:**
- No file changes — verification only

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: PASS with zero type errors

- [ ] **Step 2: Lint**

Run: `npx eslint "src/**/*.ts"`
Expected: PASS with zero lint errors

- [ ] **Step 3: Full test suite**

Run: `npx vitest run`
Expected: All tests pass (no regressions)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: Builds successfully to `dist/`

- [ ] **Step 5: Confirm no remaining duplicates**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "(fusionService|decisionProcessor|matchOutcomeDispatcher)" | grep "isAggregationAccountListMode" || echo "No remaining duplicates found in tsc output"
```
Expected: `No remaining duplicates found in tsc output`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: final verification — all tests pass, build succeeds"
```
