## Context

Identity Fusion exposes Developer Settings under Advanced Settings for troubleshooting. The `reset` connector attribute triggers a bundled reset during account-list Setup: form deletion, state wipe, and early exit with zero accounts. Operators need independent control; config naming should align (`resetAccounts`, `resetForms`).

Current flow (`accountListPhases.setupPhase`):

```
Setup → isReset()? → deleteExistingForms + disableReset + resetState → return false
```

## Goals / Non-Goals

**Goals:**

- Independent `resetAccounts` and `resetForms` toggles, both default `false`
- Each flag auto-disables after one persistent aggregation
- Account reset clears fusion state and exits with zero accounts
- Form reset deletes all Fusion review form definitions via `FormService.deleteExistingForms()`
- Legacy `reset` config key reads as `resetAccounts` for upgrade compatibility
- Dry-run detects flags but performs no side effects

**Non-Goals:**

- Selective form deletion (by age, source, or status)
- Auto-enabling one flag when the other is set
- Changing unique-attribute reset on account enable/disable
- Migration UI to rename saved `reset` keys (handled at read time)

## Decisions

### D1: Independent toggles (no parentKey)

- **Choice:** Both toggles always visible in Developer Settings; no conditional visibility
- **Reason:** Operators may need forms-only cleanup or accounts-only rebuild without the other effect
- **Considered alternatives:** Child toggle under Reset accounts? — rejected after user feedback

### D2: Setup-phase execution order

- **Choice:** Process `resetForms` first (when enabled), then evaluate `resetAccounts` for early exit
- **Reason:** When both enabled, matches prior coupled order (forms deleted before state cleared)
- **Considered alternatives:** Parallel execution — unnecessary; sequential is simpler and sufficient

### D3: Form reset does not exit early

- **Choice:** `resetForms` alone deletes forms and continues Setup through normal aggregation
- **Reason:** Form cleanup is not equivalent to account wipe; operators expect aggregation to proceed
- **Considered alternatives:** Always exit after any reset — rejected; blocks forms-only use case

### D4: Config rename with legacy fallback

- **Choice:** Read `resetAccounts ?? reset`; disable patches both `/connectorAttributes/resetAccounts` and legacy `/connectorAttributes/reset`
- **Reason:** Existing deployments with `reset: true` continue working until config is saved with new keys
- **Considered alternatives:** Hard break — rejected; unnecessary upgrade friction

### D5: Transient flags (auto-disable)

- **Choice:** Mirror `forceAttributeRefresh` — each flag patches itself to `false` after consumption on persistent runs
- **Reason:** Prevents accidental repeat resets; established operator workflow
- **Considered alternatives:** Manual disable only — rejected; error-prone in production

### D6: Dry-run gating

- **Choice:** Reset side effects run only when `isPersistent` is true
- **Reason:** Consistent with existing reset and lock behavior in dry-run mode
- **Considered alternatives:** Simulate reset in dry-run — out of scope

## Risks / Trade-offs

- [Risk] Accounts-only reset leaves stale forms referencing old managed-account keys → **Mitigation:** Document in helpKey; operator must enable `resetForms` explicitly to clear forms
- [Risk] Forms-only reset immediately re-queues managed accounts for Match → **Mitigation:** Document expected behavior; may create new review forms on same run
- [Risk] Legacy `reset` key persists in ISC after disable → **Mitigation:** `disableResetAccounts` clears both `resetAccounts` and legacy `reset`
- [Trade-off] Both flags default `false` — prior coupled behavior requires enabling both explicitly → **Reason:** Clearer semantics; avoids surprise form deletion on account reset

## Migration Plan

1. Deploy connector with renamed key and new toggle in `connector-spec.json`
2. Existing configs: `reset: true` continues to trigger account reset via read fallback
3. On first reset run after upgrade, `disableResetAccounts` clears both old and new keys
4. Operators who relied on coupled behavior should enable both `resetAccounts` and `resetForms` before running
5. Rollback: revert connector version; flags revert to single `reset` behavior

No database migration. No ISC platform changes beyond connector attribute rename.

## Open Questions

- None — decisions converged in brainstorm.
