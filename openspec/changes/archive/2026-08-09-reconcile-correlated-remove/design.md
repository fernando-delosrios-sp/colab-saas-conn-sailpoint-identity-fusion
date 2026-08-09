# Design: Reconcile Correlated Entitlement Remove

## Context

Identity Fusion exposes a `correlated` action entitlement on Fusion accounts when all managed source accounts for that identity are linked (`missing-accounts` empty). The platform may assign `correlate` / `correlated` (Add) on provisioning paths to trigger direct identity correlation (ISC PATCH) for missing accounts.

Current implementation treats Remove as housekeeping:

```
accountUpdate Remove "correlated"
  → correlateAction: actions.remove(Correlated)
  → accountUpdateHelpers: skip updateCorrelationStatus on output
  → response omits correlated even when fully correlated
```

User-confirmed domain model: **correlated is derived state**, not revocable like `fusion` or `reviewer:src-a`. Remove via account-update entitlement revocation is invalid and must fail with an observable error.

## Goals / Non-Goals

**Goals:**
- Reject Remove for `correlate` / `correlated` in `correlateAction` with message `Correlated entitlement cannot be removed: <value>`
- Remove skip-recompute machinery from account-update pipeline
- Align living specs (account-update, fusion-service, ubiquitous-language) with derived-entitlement model
- Cover reject behavior with unit tests

**Non-Goals:**
- Changing correlate Add behavior or `FusionCorrelation.updateStatus` on build/aggregation paths
- account-create Remove handling (create only processes Add today)
- Changing how `fusion`, `report`, or `reviewer` Remove behaves
- Updating `.scratch/spec-drift-report.md` (optional at apply time)

## Decisions

### D1: Reject with error (not silent no-op)

**Choice:** `assert(false, 'Correlated entitlement cannot be removed: ${change.value}')` in `correlateAction` when `change.op === AttributeChangeOp.Remove`.

**Reason:** User explicitly chose reject over silent no-op. Makes invalid ops visible; matches `Invalid reviewer action value:` pattern for action-level validation.

**Alternatives rejected:**
- Housekeeping (current) — violates derived-entitlement semantics
- Silent no-op + recompute — hides invalid platform behavior

### D2: Rejection in correlateAction handler (not accountUpdateHelpers pre-check)

**Choice:** Guard in `correlateAction.ts`; both `correlate` and `correlated` tokens route to the same handler via `executeActions`.

**Reason:** Single enforcement point for any future caller of `executeActions` with Remove; keeps account-update pipeline generic.

**Alternatives rejected:**
- Pre-check in `accountUpdateHelpers` only — duplicates logic if other paths dispatch actions

### D3: Delete skip-recompute machinery

**Choice:** Remove `shouldSkipCorrelationStatusRecompute()` and always pass `recomputeCorrelationStatus = true` (default) to `getISCAccount` from account-update.

**Reason:** Only existed to preserve forbidden Remove outcome. Dead code after D1.

### D4: Spec changes span three capabilities

**Choice:** Delta updates to `account-update-operation` (REMOVED old requirement, ADDED reject requirement), `fusion-service` (MODIFIED correlated entitlement requirement with Remove rejection scenario), `ubiquitous-language` (MODIFIED entitlement definitions).

**Reason:** account-update owns provisioning-path observable behavior; fusion-service owns entitlement semantics; UL owns canonical terms.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| ISC auto-sends Remove after correlate Add | User accepted explicit failure; document in changelog; validate in tenant if issues arise |
| Breaking change for incorrect integrations | Observable error message aids diagnosis |
| Test suite assumes housekeeping behavior | Update `correlateAction.test.ts` and `accountUpdate.test.ts` in same change |

## Migration Plan

1. Update tests first (TDD): expect reject on Remove
2. Implement `correlateAction` reject; remove skip-recompute from account-update
3. Merge delta specs into living specs
4. Run `npm test` on affected files; `openspec validate --all --json`
5. Deploy with connector release; no data migration

**Rollback:** Revert commit; no persistent state changes from reject path (operation fails before `res.send`).

## Open Questions

None — user confirmed reject-with-error during explore/propose.
