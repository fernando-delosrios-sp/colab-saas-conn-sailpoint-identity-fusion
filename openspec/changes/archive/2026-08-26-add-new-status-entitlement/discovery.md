## Scope

In: add a `new` status entitlement on Fusion accounts created for the first time in this run, and remove it whenever the account is reconstructed from a previous Fusion account. Out: new action entitlements, changing other status lifecycle rules, or treating identity-layer reuse of an existing Fusion account as a new account.

## Language

**New status** (`promote`):
The status entitlement whose wire value is `new`. It marks a Fusion account that was created in the current operation run rather than reconstructed from a previous Fusion account.
_Avoid_: created, fresh, first-run, newly created (as a wire value)

**Previous Fusion account** (`draft` — factory origin, not a new domain noun):
A persisted Fusion source account used as the construction origin via `FusionAccount.fromFusionAccount`. Not a new ubiquitous-language term.
_Avoid_: prior account, snapshot origin (ambiguous with managed-origin)

**Status entitlement** (`conflicts-with-canonical` — reuse, do not redefine):
Canonical read-only lifecycle signal. This change adds one member (`new`) to the existing catalog.
_Avoid_: flag, tag, label

## Decisions

Context: Operators need to search and filter Fusion accounts that appeared for the first time in this aggregation. Existing statuses describe correlation, match, review, and baseline; none mean “created this run.” Construction already distinguishes first-time factories (`fromIdentity`, `fromManagedAccount`, `fromFusionDecision`) from reconstruction (`fromFusionAccount`).

Q1: When is `new` set?
Chosen: **On first-time Fusion account factories** — `fromIdentity`, `fromManagedAccount`, and `fromFusionDecision`. Those paths create a Fusion account that did not exist as a previous Fusion account.

Q2: When is `new` removed?
Chosen: **Whenever origin is a previous Fusion account** — `fromFusionAccount` MUST drop `new` even if the persisted `statuses` attribute still contains it from the prior aggregation. Next aggregation therefore clears the marker automatically.

Q3: Does reusing an existing Fusion account for a recreated identity add `new`?
Chosen: **No.** `IdentityProcessor` reuse (`findFusionAccountForIdentity`) keeps the existing account. If that account came from `fromFusionAccount`, `new` is already gone. If it was created earlier in the same run, it already has `new` and should keep it.

Q4: Wire value and catalog?
Chosen: Wire value `new`, display name `New`, description that the Fusion account was created in this aggregation. Enum member `StatusEntitlement.New`. Catalog count 11 → 12.

Q5: Persist to ISC?
Chosen: **Yes**, like other statuses. First aggregation emits `new`; the following aggregation reconstructs from that previous Fusion account and removes it.

## Open questions

None blocking. Assumption: entitlement-list streams `new` from the static catalog with no extra API calls. Assumption: docs glossary and schema search notes mention `new` the same way as `candidate` / `uncorrelated`.

## Scenarios discussed

- New identity with no previous Fusion account → `fromIdentity` → statuses include `new` and `baseline`.
- Uncorrelated managed account with no previous Fusion account → `fromManagedAccount` → statuses include `new` and `uncorrelated`.
- Fusion decision with no existing identity Fusion account → `fromFusionDecision` → statuses include `new` and `uncorrelated`.
- Fusion decision applied onto an existing identity Fusion account → no new factory; do not add `new` solely because of the decision.
- Persisted Fusion account whose `statuses` still contain `new` → `fromFusionAccount` → `new` is absent.
- Persisted Fusion account without `new` → `fromFusionAccount` → `new` stays absent.
- Identity recreation reuse of an existing Fusion account → do not add `new`.
- Same-run blend of a managed account into a Fusion account that was created this run → `new` remains until a later run reconstructs from the previous Fusion account.
