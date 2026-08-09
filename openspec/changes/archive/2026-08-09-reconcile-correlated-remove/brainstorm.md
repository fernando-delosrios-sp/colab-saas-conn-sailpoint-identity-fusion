# Brainstorm: Reconcile Correlated Entitlement Remove

## Background

Spec drift audit (`.scratch/spec-drift-report.md`) flagged **Correlated action Remove** as medium severity:

- **fusion-service** states `correlated` is an outcome of the build process — "not an independently removed entitlement"
- **Code** (`correlateAction.ts`) calls `actions.remove(Correlated)` on Remove and **account-update** skips correlation-status recompute so the removal sticks in the response

Exploration traced a cross-spec tension: `account-update-operation` (added in `2026-07-31-harden-operation-specs-gherkin`) documents Remove as "platform housekeeping." User clarified the **intended domain model** differs.

## Domain model (user-confirmed)

1. **Correlated entitlement** is derived: present when all managed source accounts are linked in the Fusion identity (`missing-accounts` empty).
2. **Correlate action (Add)** is enforcement: when the platform assigns `correlate` / `correlated`, the connector runs direct identity correlation (ISC PATCH) for missing managed accounts.
3. **Remove** via account-update entitlement revocation is **invalid** — correlated cannot be manually stripped; it reflects correlation state, not a revocable grant like `fusion` or `reviewer:src-a`.

## Decision chain

### Q1: What should happen on account-update Remove for `correlate` / `correlated`?

**Options considered:**

| Option | Behavior | Trade-off |
|--------|----------|-----------|
| A. Housekeeping (current code) | Remove from actions set + skip recompute | Allows correlated to disappear while identity is fully correlated — wrong semantics |
| B. Silent no-op + recompute | Ignore Remove; output reflects derived state | Safe but hides invalid platform ops |
| C. **Reject with error** | Operation fails with observable message | Explicit contract; surfaces misconfiguration |

**Decision: C — Reject with error** (user confirmed)

Error message pattern (repo convention): `Correlated entitlement cannot be removed: <value>`

Implementation location: `correlateAction.ts` via `assert(false, message)` on `AttributeChangeOp.Remove`.

### Q2: What code to delete?

- Remove branch in `correlateAction.ts` (replace with assert)
- `shouldSkipCorrelationStatusRecompute()` in `accountUpdateHelpers.ts`
- `getISCAccount(..., recompute=false)` path triggered by correlate Remove on update

### Q3: Which specs are wrong?

- **fusion-service** — correct intent ("not independently removed"); may need explicit Remove-rejection scenario
- **account-update-operation** — wrong ("skips recompute on correlate Remove") — must be replaced
- **ubiquitous-language** — clarify correlated entitlement is not revocable on provisioning Remove paths

### Q4: Risk if ISC auto-sends Remove after correlate Add?

Hard reject may break automated provisioning flows if the platform sends Remove as post-consumption cleanup. User chose explicit failure over silent acceptance — acceptable to surface integration issues early.

## Agreed approach

Code + spec reconciliation:

1. Reject Remove in `correlateAction` with `Correlated entitlement cannot be removed: <value>`
2. Remove skip-recompute machinery from account-update pipeline
3. Replace account-update spec requirement with reject scenario
4. Strengthen fusion-service + UL to state correlated is derived and not revocable
5. Update tests: `correlateAction.test.ts`, `accountUpdate.test.ts`

## Out of scope

- Changing correlate Add behavior or `FusionCorrelation.updateStatus` build-path logic
- account-create Remove handling (create path only processes Add today)
- `.scratch/spec-drift-report.md` update (optional housekeeping at apply time)
