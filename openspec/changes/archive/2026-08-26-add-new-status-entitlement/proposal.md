## Why

Operators cannot search Fusion accounts that first appeared in the current aggregation. Existing status entitlements describe correlation, match, review, and baseline, not first-time creation. Construction already distinguishes first-time factories from reconstruction via `fromFusionAccount`. A `new` status emitted on create and dropped when the origin is a previous Fusion account makes that cohort filterable in ISC until the next aggregation.

## What Changes

**New status entitlement**
- From: Eleven status entitlements; no marker for first-time Fusion account creation.
- To: Twelfth status `new` (`StatusEntitlement.New`). First-time factories (`fromIdentity`, `fromManagedAccount`, `fromFusionDecision`) add it. `fromFusionAccount` removes it even if the persisted statuses still contain it.
- Reason: Operators need a one-aggregation-cycle search signal for accounts created this run.
- Impact: Non-breaking additive catalog member. Existing Fusion accounts never keep `new` after reconstruction.

**Identity reuse**
- From: Recreated identities may reuse an existing Fusion account (`findFusionAccountForIdentity`).
- To: Reuse does not add `new`. Same-run first-time accounts keep `new` until a later run reconstructs them from the previous Fusion account.
- Reason: Reuse is not first-time creation.
- Impact: Non-breaking.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `entitlement-service`: `StatusEntitlement` and `src/data/status.ts` catalog gain `New` / `new`; member count 11 → 12; contract tests and call-site enum requirement include `New`
- `fusion-service`: first-time factories add `new`; `fromFusionAccount` strips `new`
- `ubiquitous-language`: **New** status entitlement (`new`)

## Impact

- **Code:** `src/model/statusEntitlement.ts`, `src/data/status.ts`, `src/model/fusionAccountFactories.ts` (and any tests that assert exact status sets or enum count: `statusEntitlement.test.ts`, fusion account factory tests)
- **Docs:** `docs/glossary.md` status table; `docs/reference/standard-account-schema.md` search note
- **Changelog:** PATCH user-facing note that Fusion accounts created this aggregation carry `new` until the next aggregation
- **Migration:** None. Persisted `new` from a prior run is stripped on the next `fromFusionAccount` load
