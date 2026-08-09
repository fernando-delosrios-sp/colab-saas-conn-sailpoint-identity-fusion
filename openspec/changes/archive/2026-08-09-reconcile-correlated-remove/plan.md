# Reconcile Correlated Entitlement Remove Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject account-update Remove for `correlate` / `correlated` with observable error; remove skip-recompute machinery; align living specs with derived-entitlement domain model.

**Architecture:** Single enforcement point in `correlateAction.ts` via `assert` on Remove. Account-update pipeline always recomputes correlation status on output. Delta specs update account-update-operation, fusion-service, and ubiquitous-language.

**Tech Stack:** TypeScript, Vitest, OpenSpec.

**Canonical test command:** `npm test -- src/operations/actions/__tests__/correlateAction.test.ts src/operations/__tests__/accountUpdate.test.ts`

**Change artifacts:** `openspec/changes/reconcile-correlated-remove/{brainstorm,proposal,design,tasks,specs/**}.md`

## Global Constraints

- TDD: write/update failing tests before implementation
- Error message MUST match `Correlated entitlement cannot be removed: <value>` exactly
- Do not change correlate Add behavior or `FusionCorrelation.updateStatus` build logic
- Run `openspec validate --all --json` after spec merges

---

### Task 1: correlateAction Remove rejection (TDD)

**Files:**
- Modify: `src/operations/actions/__tests__/correlateAction.test.ts`
- Modify: `src/operations/actions/correlateAction.ts`

- [ ] **Step 1:** Update Remove test to expect rejection:
  ```typescript
  await expect(
      correlateAction(fusionAccount, { op: AttributeChangeOp.Remove, value: FusionAction.Correlated }, serviceRegistry)
  ).rejects.toMatchObject({ message: 'Correlated entitlement cannot be removed: correlated' })
  expect(fusionAccount.collections.actions.remove).not.toHaveBeenCalled()
  ```
- [ ] **Step 2:** Run test — confirm FAIL (currently passes Remove)
  ```bash
  npm test -- src/operations/actions/__tests__/correlateAction.test.ts
  ```
- [ ] **Step 3:** Implement in `correlateAction.ts`:
  ```typescript
  import { assert } from '../../utils/assert'
  // ...
  } else if (change.op === AttributeChangeOp.Remove) {
      assert(false, `Correlated entitlement cannot be removed: ${change.value}`)
  }
  ```
- [ ] **Step 4:** Add test for `correlate` token Remove — same error with value `correlate`
- [ ] **Step 5:** Run test — confirm PASS
  ```bash
  npm test -- src/operations/actions/__tests__/correlateAction.test.ts
  ```

---

### Task 2: account-update pipeline cleanup (TDD)

**Files:**
- Modify: `src/operations/__tests__/accountUpdate.test.ts`
- Modify: `src/operations/helpers/accountUpdateHelpers.ts`

- [ ] **Step 1:** Replace skip-recompute test with reject test:
  ```typescript
  it('fails when removing correlated action entitlement', async () => {
      // mockCrashThrows(registry); real executeActions
      await expect(accountUpdate(registry, {
          identity: 'fusion-1',
          schema: { attributes: [] },
          changes: [{ attribute: 'actions', op: 'Remove', value: FusionAction.Correlated }],
      } as any)).rejects.toMatchObject({ message: 'Correlated entitlement cannot be removed: correlated' })
      expect(registry.res.send).not.toHaveBeenCalled()
  })
  ```
- [ ] **Step 2:** Run test — confirm FAIL
  ```bash
  npm test -- src/operations/__tests__/accountUpdate.test.ts
  ```
- [ ] **Step 3:** Remove `shouldSkipCorrelationStatusRecompute()` and `shouldRecomputeCorrelationStatus` flag from `accountUpdateHelpers.ts`
- [ ] **Step 4:** Change `getISCAccount` call to `await fusion.getISCAccount(fusionAccount, true)` (drop third arg)
- [ ] **Step 5:** Run test — confirm PASS
  ```bash
  npm test -- src/operations/__tests__/accountUpdate.test.ts
  ```

---

### Task 3: Living spec merges

**Files:**
- Modify: `openspec/specs/account-update-operation/spec.md`
- Modify: `openspec/specs/fusion-service/spec.md`
- Modify: `openspec/specs/ubiquitous-language/spec.md`
- Source deltas: `openspec/changes/reconcile-correlated-remove/specs/**/spec.md`

- [ ] **Step 1:** Merge account-update-operation delta (REMOVED skip-recompute; ADDED reject requirement)
- [ ] **Step 2:** Merge fusion-service delta (MODIFIED correlated entitlement + Remove rejection scenario)
- [ ] **Step 3:** Merge ubiquitous-language delta (MODIFIED pair requirement + Remove invalid scenario)
- [ ] **Step 4:** Validate
  ```bash
  openspec validate --all --json
  ```

---

### Task 4: Documentation and changelog

**Files:**
- Modify: JSDoc on `correlateAction.ts`; optional MkDocs if action entitlements documented

- [ ] **Step 1:** Update `correlateAction` JSDoc — Remove fails; Add triggers correlation
- [ ] **Step 2:** Review `getISCAccount` comment — remove account-update skip-recompute reference if stale
- [ ] **Step 3:** Changelog entry for breaking Remove behavior

---

### Task 5: Final verification

- [ ] **Step 1:** Full targeted test run
  ```bash
  npm test -- src/operations/actions/__tests__/correlateAction.test.ts src/operations/__tests__/accountUpdate.test.ts
  ```
- [ ] **Step 2:** Lint if needed: `npm run lint`
- [ ] **Step 3:** `openspec validate --all --json` — all valid
- [ ] **Step 4:** Optional: mark correlated Remove resolved in `.scratch/spec-drift-report.md`
