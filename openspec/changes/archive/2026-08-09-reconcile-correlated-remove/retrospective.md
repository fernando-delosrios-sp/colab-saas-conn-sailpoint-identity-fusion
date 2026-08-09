# Retrospective: reconcile-correlated-remove

> Written: 2026-08-09 (after verify passed)

---

## 0. Evidence

- **Tasks done**: 20/20
- **Tests**: 10/10 passed (correlateAction + accountUpdate)
- **OpenSpec validate**: 39/39 valid
- **Scope**: Code + living spec merge (breaking account-update behavior)

---

## 1. Wins

- Clarified derived-entitlement model: correlated reflects missing-accounts state, not revocable via Remove
- Single enforcement point in `correlateAction` with observable error message
- Removed dead skip-recompute path from account-update pipeline
- Closed spec-drift item from `.scratch/spec-drift-report.md`

## 2. Misses

- 📌 `retrospective.md` was placeholder until archive — filled at archive time

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| — | None | Plan followed as written |

## 4. Skill / workflow compliance

All apply-phase steps completed: TDD tests, implementation, spec merge, verify.

## 5. Surprises

- Prior `account-update-operation` spec documented "platform housekeeping" Remove — contradicted fusion-service derived-entitlement intent

## 6. Promote candidates

- [ ] 📌 **Derived entitlements reject Remove, not no-op** -> **Promote to memory**
  > **Why**: Housekeeping pattern was codified in spec and code but wrong for correlated
  > **How to apply**: When auditing action Remove handlers, classify derived vs revocable before choosing no-op vs reject
