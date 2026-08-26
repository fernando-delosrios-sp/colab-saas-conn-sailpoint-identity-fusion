## Context

Fusion accounts are constructed in two ways: first-time factories (`fromIdentity`, `fromManagedAccount`, `fromFusionDecision`) and reconstruction from a persisted Fusion source account (`fromFusionAccount`). Status entitlements are calculated, serialized on the account, and listed from a static catalog. Operators can search those statuses in ISC. Nothing currently marks “this Fusion account did not exist before this run.”

## Goals / Non-Goals

**Goals:**

- Add catalog member `new` (`StatusEntitlement.New`) as a read-only status entitlement
- Set `new` on first-time Fusion account construction
- Remove `new` when reconstructing from a previous Fusion account, including when the persisted statuses still contain it
- Keep identity-reuse of an existing Fusion account from adding `new`

**Non-Goals:**

- New action entitlements or assignment of `new` from ISC
- Changing orphan, uncorrelated, baseline, or review status rules
- A persistent “created at” timestamp or multi-run history of first creation
- C4/container architecture (single in-process catalog + factory change)

## Decisions

### D1: Set `new` only in first-time factories

- **Choice**: After existing hydrate/status setup, `fromIdentity`, `fromManagedAccount`, and `fromFusionDecision` add `StatusEntitlement.New`. Do not add it in `fromFusionAccount`, identity reuse, or decision-on-existing-identity paths.
- **Reason**: Those three factories are the only constructors whose origin is not a previous Fusion account.
- **Considered alternatives**: Set `new` later in FusionService after registration — more call sites, easier to miss a factory. Infer “new” from missing ISC `id` — reconstruction of never-provisioned rows and tests would false-positive.

### D2: Strip `new` in `fromFusionAccount`

- **Choice**: After hydrating persisted collections (and identity-origin baseline repair), remove `StatusEntitlement.New`. Always, including when it was not present.
- **Reason**: The previous Fusion account is the origin; the one-aggregation-cycle marker must not survive into the next run even if ISC still stored it.
- **Considered alternatives**: Leave persisted `new` until some later recompute — would keep every historical create forever. Strip only during account-list process — misses other `fromFusionAccount` entry points (read, rebuild).

### D3: Catalog and enum stay the single source of the wire value

- **Choice**: `StatusEntitlement.New = 'new'`; `src/data/status.ts` entry `{ id: StatusEntitlement.New, name: 'New', description: 'Fusion account created in this aggregation' }` (wording may be tightened in apply). Contract test expects twelve members. Production call sites use the enum.
- **Reason**: Existing entitlement-service contract; entitlement-list streams the static array with no extra work.
- **Considered alternatives**: Hard-coded string `'new'` at factories — violates the enum contract.

### D4: Tests assert factory status sets, not aggregation wall-clock

- **Choice**: Factory unit tests: first-time constructors contain `new`; `fromFusionAccount` with persisted `new` does not. Contract test count 12. Existing tests that snapshot exact `statuses` arrays must include or exclude `new` according to constructor.
- **Reason**: Behavior is construction-time; identity reuse already has tests that should not start asserting `new`.

## Risks / Trade-offs

[Risk] Existing tests freeze exact `statuses` arrays from first-time factories and fail. -> Mitigation: Update those assertions in apply; TDD the factory cases first.

[Risk] Operators treat `new` as a permanent “never seen before this source” flag. -> Mitigation: Docs and catalog description say it lasts until the next aggregation that reconstructs from the previous Fusion account.

[Trade-off] `new` disappears on the subsequent aggregation even if the account was created yesterday and never processed again until then. -> Reason for acceptance: Matches “remove when origin is a previous fusion account”; no extra persistence.

[Trade-off] Identity-origin first create also gets `new`, not only uncorrelated managed-origin accounts. -> Reason for acceptance: Those Fusion accounts are also newly created; search can combine `new` with `uncorrelated` or `baseline`.

## Migration Plan

N/A — This change does not involve deployment changes. After upgrade, accounts created in that aggregation carry `new`. On the following aggregation they are loaded with `fromFusionAccount` and `new` is removed. Accounts that already existed have no `new` to strip unless a tenant somehow wrote the string; strip is idempotent.

## Open Questions

None.
