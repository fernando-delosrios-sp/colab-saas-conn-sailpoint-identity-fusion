# Move Layer Methods to Processors — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove 4 thin-wrapper layer methods from `FusionAccountBase`, make `state` public, and update all callers to use free functions from `layerRules.ts` directly.

**Architecture:** `FusionAccountState` becomes publicly readable via `public readonly state`. Processors (DecisionProcessor, IdentityProcessor, FusionService) and MatchingService import layer free functions and pass `fusionAccount.state` as first arg. No new abstractions — just removing indirection.

**Tech Stack:** TypeScript (strict), Vitest, Node.js ES2022

## Global Constraints

- No behavioral changes — all tests must pass as-is after mechanical updates
- `npm run lint` and `npm test` must pass
- Internal-only refactor; no config schema or connector operation changes

---

## Task 1: Expose state publicly on FusionAccountBase

**Files:**
- Modify: `src/model/fusionAccountBase.ts`

**Interfaces:**
- Produces: `FusionAccountBase.state` changes from `protected readonly` to `public readonly FusionAccountState`

- [ ] **Step 1: Change visibility keyword**

In `src/model/fusionAccountBase.ts`, change line containing `protected readonly state`:

```typescript
public readonly state: FusionAccountState
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors. State is now accessible from outside.

- [ ] **Step 3: Commit**

```bash
git add src/model/fusionAccountBase.ts
git commit -m "refactor: make FusionAccountBase.state public readonly"
```

---

## Task 2: Remove layer methods from FusionAccountBase

**Files:**
- Modify: `src/model/fusionAccountBase.ts`

**Interfaces:**
- Consumes: `public readonly state` from Task 1
- Removes: `addIdentityLayer`, `addManagedAccountLayer`, `addFusionDecisionLayer`, `addFusionMatch` methods

- [ ] **Step 1: Delete the 4 layer methods and their imports**

In `src/model/fusionAccountBase.ts`, remove these imports:
```typescript
// DELETE this block:
import {
    addFusionDecisionLayer,
    addFusionMatch,
    addIdentityLayer,
    addManagedAccountLayer,
    clearFusionIdentityReferences,
    type AddManagedAccountOptions,
} from './fusionAccountRules/layerRules'
```

Remove these methods (and their JSDoc comments):
- `public addIdentityLayer(identity: IdentityDocument): void { addIdentityLayer(this.state, identity) }`
- `public addManagedAccountLayer(workQueue: WorkQueue, allAccountsById?: Map<string, Account>, options: AddManagedAccountOptions = {}): void { addManagedAccountLayer(this.state, workQueue, allAccountsById, options) }`
- `public addFusionDecisionLayer(decision: FusionDecision): void { addFusionDecisionLayer(this.state, decision) }`
- `public addFusionMatch(fusionMatch: FusionMatch): void { addFusionMatch(this.state, fusionMatch) }`

Also remove `clearFusionIdentityReferences()` method and re-add its import separately if it's still needed elsewhere in the file.

- [ ] **Step 2: Check what else uses the removed imports**

Run: `grep -n "clearFusionIdentityReferences\|addFusionDecisionLayer\|addFusionMatch\|addIdentityLayer\|addManagedAccountLayer" src/model/fusionAccountBase.ts`
Expected: No matches — all removed.

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: Compile errors in callers that still reference `fusionAccount.addManagedAccountLayer()` etc. — expected.

- [ ] **Step 4: Commit**

```bash
git add src/model/fusionAccountBase.ts
git commit -m "refactor: remove layer pass-through methods from FusionAccountBase"
```

---

## Task 3: Update DecisionProcessor

**Files:**
- Modify: `src/services/fusionService/decisionProcessor.ts`

**Interfaces:**
- Consumes: `public readonly state` from Task 1, free functions from `layerRules.ts`
- Produces: Same behavior via free function calls instead of instance method calls

- [ ] **Step 1: Add layerRules import**

In `src/services/fusionService/decisionProcessor.ts`, add to imports:

```typescript
import { addIdentityLayer, addManagedAccountLayer, addFusionDecisionLayer } from '../../model/fusionAccountRules/layerRules'
```

- [ ] **Step 2: Replace addIdentityLayer call**

Change line 168:
```typescript
// FROM:
fusionAccount.addIdentityLayer(selectedIdentity)
// TO:
addIdentityLayer(fusionAccount.state, selectedIdentity)
```

- [ ] **Step 3: Replace addFusionDecisionLayer call**

Change line 173:
```typescript
// FROM:
fusionAccount.addFusionDecisionLayer(fusionDecision)
// TO:
addFusionDecisionLayer(fusionAccount.state, fusionDecision)
```

- [ ] **Step 4: Replace addManagedAccountLayer call**

Change lines 181-189:
```typescript
// FROM:
fusionAccount.addManagedAccountLayer(
    this.run,
    this.deps.sources.managedAccountsAllById,
    {
        pruneDeleted: this.deps.shouldPruneDeletedManagedAccounts(),
        skipBlendHistoryForManagedKeys,
        onBlend: (account) => this.deps.registerFusionBlend(fusionAccount, account),
    }
)
// TO:
addManagedAccountLayer(
    fusionAccount.state,
    this.run,
    this.deps.sources.managedAccountsAllById,
    {
        pruneDeleted: this.deps.shouldPruneDeletedManagedAccounts(),
        skipBlendHistoryForManagedKeys,
        onBlend: (account) => this.deps.registerFusionBlend(fusionAccount, account),
    }
)
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/services/fusionService/__tests__/ --reporter=verbose 2>&1 | head -100`
Expected: Tests compile and pass (or fail with expected update messages if test files also reference old method names — Task 7 will fix those).

- [ ] **Step 6: Commit**

```bash
git add src/services/fusionService/decisionProcessor.ts
git commit -m "refactor: DecisionProcessor uses layer free functions directly"
```

---

## Task 4: Update IdentityProcessor

**Files:**
- Modify: `src/services/fusionService/identityProcessor.ts`

**Interfaces:**
- Consumes: `public readonly state` from Task 1, free functions from `layerRules.ts`

- [ ] **Step 1: Add layerRules import**

In `src/services/fusionService/identityProcessor.ts`, add to imports:

```typescript
import { addIdentityLayer, addManagedAccountLayer } from '../../model/fusionAccountRules/layerRules'
```

- [ ] **Step 2: Replace addIdentityLayer calls (2 occurrences)**

Line ~106:
```typescript
// FROM:
existingAccount.addIdentityLayer(identity)
// TO:
addIdentityLayer(existingAccount.state, identity)
```

Line ~119:
```typescript
// FROM:
fusionAccount.addIdentityLayer(identity)
// TO:
addIdentityLayer(fusionAccount.state, identity)
```

- [ ] **Step 3: Replace addManagedAccountLayer call**

Lines ~124-130:
```typescript
// FROM:
fusionAccount.addManagedAccountLayer(
    this.run,
    this.deps.sources.managedAccountsAllById,
    {
        pruneDeleted: this.deps.shouldPruneDeletedManagedAccounts(),
        onBlend: (account) => this.deps.registerFusionBlend(fusionAccount, account),
    }
)
// TO:
addManagedAccountLayer(
    fusionAccount.state,
    this.run,
    this.deps.sources.managedAccountsAllById,
    {
        pruneDeleted: this.deps.shouldPruneDeletedManagedAccounts(),
        onBlend: (account) => this.deps.registerFusionBlend(fusionAccount, account),
    }
)
```

- [ ] **Step 4: Commit**

```bash
git add src/services/fusionService/identityProcessor.ts
git commit -m "refactor: IdentityProcessor uses layer free functions directly"
```

---

## Task 5: Update FusionService

**Files:**
- Modify: `src/services/fusionService/fusionService.ts`

**Interfaces:**
- Consumes: `public readonly state` from Task 1, free functions from `layerRules.ts`

- [ ] **Step 1: Add layerRules import**

In `src/services/fusionService/fusionService.ts`, add to imports:

```typescript
import { addIdentityLayer, addManagedAccountLayer, addFusionDecisionLayer } from '../../model/fusionAccountRules/layerRules'
```

- [ ] **Step 2: Replace addIdentityLayer call**

Line ~506 (in `processFusionAccount`):
```typescript
// FROM:
fusionAccount.addIdentityLayer(identity)
// TO:
addIdentityLayer(fusionAccount.state, identity)
```

- [ ] **Step 3: Replace addFusionDecisionLayer call**

Line ~514 (in `processFusionAccount`):
```typescript
// FROM:
fusionAccount.addFusionDecisionLayer(authorizedLinkDecision)
// TO:
addFusionDecisionLayer(fusionAccount.state, authorizedLinkDecision)
```

- [ ] **Step 4: Replace addManagedAccountLayer call**

Lines ~547-556 (in `processFusionAccount`):
```typescript
// FROM:
fusionAccount.addManagedAccountLayer(
    this.run,
    this.sources.managedAccountsAllById,
    {
        pruneDeleted: this.shouldPruneDeletedManagedAccounts(),
        addBlendHistory: true,
        skipBlendHistoryForManagedKeys,
        onBlend: (account) => this.registerFusionBlend(fusionAccount, account),
    }
)
// TO:
addManagedAccountLayer(
    fusionAccount.state,
    this.run,
    this.sources.managedAccountsAllById,
    {
        pruneDeleted: this.shouldPruneDeletedManagedAccounts(),
        addBlendHistory: true,
        skipBlendHistoryForManagedKeys,
        onBlend: (account) => this.registerFusionBlend(fusionAccount, account),
    }
)
```

- [ ] **Step 5: Commit**

```bash
git add src/services/fusionService/fusionService.ts
git commit -m "refactor: FusionService uses layer free functions directly"
```

---

## Task 6: Update MatchingService

**Files:**
- Modify: `src/services/matchingService/matchingService.ts`

**Interfaces:**
- Consumes: `public readonly state` from Task 1, `addFusionMatch` from `layerRules.ts`

- [ ] **Step 1: Add addFusionMatch import**

In `src/services/matchingService/matchingService.ts`, add to imports:

```typescript
import { addFusionMatch } from '../../model/fusionAccountRules/layerRules'
```

- [ ] **Step 2: Replace addFusionMatch call**

Line ~548 (in `compareFusionAccounts`):
```typescript
// FROM:
fusionAccount.addFusionMatch(fusionMatch)
// TO:
addFusionMatch(fusionAccount.state, fusionMatch)
```

- [ ] **Step 3: Commit**

```bash
git add src/services/matchingService/matchingService.ts
git commit -m "refactor: MatchingService uses addFusionMatch free function directly"
```

---

## Task 7: Update tests

**Files:**
- Modify: `src/model/__tests__/fusionAccount.test.ts`
- Modify: `src/services/fusionService/__tests__/fusionService.test.ts`
- Modify: `src/operations/__tests__/chain/harness/ReplayAdapter.ts`

**Interfaces:**
- Consumes: `public readonly state` from Task 1, free functions from `layerRules.ts`

- [ ] **Step 1: Update fusionAccount.test.ts**

Add import at top of `src/model/__tests__/fusionAccount.test.ts`:
```typescript
import { addManagedAccountLayer, addIdentityLayer, addFusionDecisionLayer, addFusionMatch } from '../fusionAccountRules/layerRules'
```

Replace all occurrences:
```typescript
// FROM: acc.addManagedAccountLayer(run, ...)
// TO:   addManagedAccountLayer(acc.state, run, ...)
// FROM: acc.addIdentityLayer(identity)
// TO:   addIdentityLayer(acc.state, identity)
// FROM: acc.addFusionDecisionLayer(decision)
// TO:   addFusionDecisionLayer(acc.state, decision)
// FROM: acc.addFusionMatch(...)
// TO:   addFusionMatch(acc.state, ...)
```

- [ ] **Step 2: Update fusionService.test.ts**

Add import:
```typescript
import { addManagedAccountLayer, addIdentityLayer, addFusionDecisionLayer, addFusionMatch } from '../../../model/fusionAccountRules/layerRules'
```

Replace all `fusionAccount.addManagedAccountLayer(...)` → `addManagedAccountLayer(fusionAccount.state, ...)` and similarly for the other 3 methods.

- [ ] **Step 3: Update ReplayAdapter.ts**

Add import in `src/operations/__tests__/chain/harness/ReplayAdapter.ts`:
```typescript
import { addManagedAccountLayer, addIdentityLayer } from '../../../../model/fusionAccountRules/layerRules'
```

Replace `fusionAccount.addManagedAccountLayer(...)` → `addManagedAccountLayer(fusionAccount.state, ...)` and `fusionAccount.addIdentityLayer(...)` → `addIdentityLayer(fusionAccount.state, ...)`.

- [ ] **Step 4: Run model tests**

Run: `npx vitest run src/model/__tests__/fusionAccount.test.ts --reporter=verbose`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/model/__tests__/fusionAccount.test.ts src/services/fusionService/__tests__/fusionService.test.ts src/operations/__tests__/chain/harness/ReplayAdapter.ts
git commit -m "test: update tests for free-function layer calls"
```

---

## Task 8: Final verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit final state (if any fixups needed)**

```bash
git add -A
git commit -m "chore: final verification fixes"
```
