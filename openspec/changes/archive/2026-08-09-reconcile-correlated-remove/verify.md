# Verification Report

> Generated inside apply step 2 (verify-fix loop).

**Change**: `reconcile-correlated-remove`  
**Verified at**: `2026-08-09`  
**Verifier**: apply agent

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] All items have `"valid": true`

**Result**:

```text
39/39 items passed (1 change + 38 specs). reconcile-correlated-remove: valid.
```

---

## 2. Task Completion Sanity Check (`tasks.md`)

- [x] All `- [ ]` are `- [x]` (including Documentation and Changelog sections)

**Uncompleted tasks**: none

---

## 3. Spec Scenario Test Coverage

| Scenario (spec / requirement) | Test (file / name) | Covers GIVEN/WHEN/THEN? |
|---|---|---|
| Correlated Remove fails with observable message | `accountUpdate.test.ts` — fails when removing correlated action entitlement | ✓ |
| Correlate token Remove fails with observable message | `accountUpdate.test.ts` — fails when removing correlate action token | ✓ |
| Correlated Remove rejected on provisioning path | `correlateAction.test.ts` — rejects correlated action entitlement Remove | ✓ |
| Correlated entitlement Remove is invalid on provisioning paths | UL spec-only (documentation contract) | N/A |
| Add path still correlates | `correlateAction.test.ts` — correlates missing accounts on Add | ✓ |

**Coverage gaps**: none

---

## 4. Design / Specs Coherence

| Design decision | Corresponding requirement / scenario | Gap? |
|---|---|---|
| D1 Reject with error | account-update + fusion-service reject scenarios | — |
| D2 Handler enforcement | correlateAction tests | — |
| D3 Delete skip-recompute | account-update always calls getISCAccount with default recompute | — |

**Material drift**: none

---

## 5. Deferred Manual Dogfood vs Automated Test Equivalence

No `[~]` rows in plan.md — section blank (PASS).

---

## Commands

| Command | Result |
|---|---|
| `npm test -- src/operations/actions/__tests__/correlateAction.test.ts src/operations/__tests__/accountUpdate.test.ts` | 10/10 passed |
| `openspec validate --all --json` | 39/39 valid |

---

## Overall Decision

- [x] ✅ PASS — Can proceed to retrospective and archive
- [ ] ❌ FAIL

**Next Step**: Archive change when ready.
