## Scope

Expose the Fusion account's **live collection state** — `statuses`, `actions`, `reviews` — as own properties on the Velocity caller context, so Normal and Unique attribute definitions can branch on this run's values instead of the previous run's persisted copy.

Out of scope: exposing account-id sets, `missing-accounts`, `sources`, or `history`; adding a convenience reviewer flag or Velocity helper; changing when reviewer registration happens relative to the Process-phase Define pass; any change to what `syncCollectionAttributesToBag` writes at output.

## Language

**Live collection state** (`draft`):
The values currently held by **FusionCollections** for `statuses`, `actions`, and `reviews` — what the running aggregation has decided so far. Already surfaced by the `FusionAccount.statuses` / `.actions` / `.reviews` getters.
_Avoid_: collection attributes, synced statuses, current statuses (ambiguous with `attributeBag.current`)

**Persisted collection snapshot** (`draft`):
The copy of those same sets that `syncToBag` writes into the attribute bag at output time, which the next aggregation reads back through `buildFromFusionAccount`. This is what a template reaches today when it references `$statuses`, and it is always at most one aggregation stale.
_Avoid_: previous statuses (`$previous.*` is a distinct, already-specified context key), bag statuses

Conflict-check against `openspec/specs/ubiquitous-language/spec.md`: **FusionCollections** is canonical and used with its canonical meaning ("the collaborator that owns account-id sets, missing-accounts, statuses, actions, reviews, sources, fusion matches, history, and related collection sync-to-bag behavior"). **Reviewer**, **statuses**, and **actions** are canonical business terms and are not redefined here. No term conflicts with canonical vocabulary.

No term is marked `promote`. Both are local vocabulary for stating the requirement; the canonical glossary already covers the nouns they are built from.

## Decisions

**Context.** On tenant `company24509-poc`, source *Orphan Account Management* needs its `id` Unique definition to emit a UUID for reviewer Fusion accounts and render empty for everyone else, so that `skipAccountsWithMissingId` suppresses the other ~317 identity-origin accounts. The natural expression is a reviewer test against `$statuses`. It cannot work today.

**Q1 — Why can a definition not read reviewer status today?**
Reviewer state is set on `FusionCollections` (`actions.setSourceReviewer` adds the `reviewer` status alongside the `reviewer:<sourceId>` action) and reaches the attribute bag only through `syncCollectionAttributesToBag`, which has three call sites — `getISCAccount` and two in `decisionProcessor`. In the aggregation path, `processOutputBatch` calls `refreshUniqueAttributes` and *then* `getISCAccount`, so unique definitions evaluate before the sync. `buildVelocityContext` builds the caller context as `Object.create(fusionAccount.attributeBag.current)`, so `$statuses` resolves to the persisted collection snapshot: last run's values for a reloaded Fusion account, and nothing at all for an account created this run (`buildFromIdentity` seeds the bag from `IdentityDocument.attributes`, which carry no Fusion control attributes when the Fusion source is not authoritative for that identity).

The consequence for the driving use case is a deadlock, not just staleness: a reviewer with no Fusion account gets an empty `id`, is suppressed from output, is therefore never persisted, and so never acquires a persisted `reviewer` status for the next run to read.

**Q2 — Expose live state in the context, or sync the bag earlier?**
Expose it in the context. Setting `context.statuses` / `.actions` / `.reviews` from the existing `FusionAccount` getters has no persistence side effects, fixes every Define entry point at once (`accountList`, `accountRead`, `accountCreate`, `accountEnable`), and needs no knowledge of phase ordering in any caller.

The rejected alternative — calling `syncCollectionAttributesToBag()` before `refreshUniqueAttributes` in `processOutputBatch` — mutates the persisted attribute bag earlier than output for a read-only need, encodes Define's context requirements into an output-batching helper, and only repairs the `accountList` path.

**Q3 — Why own properties rather than relying on the prototype chain?**
Because the persisted collection snapshot is already inherited under exactly these names. An own property shadows it, which is the same mechanism the existing requirement *DefinitionService Velocity caller context does not clone the current bag* uses for `identity`, `accounts`, `previous`, `sources`, `account`, `originSource`, and `originAccount`. This change adds three names to that set rather than inventing a second mechanism.

**Q4 — Which collections stay out?**
Account-id sets, `missing-accounts`, `sources`, and `history`. `$accounts` and `$sources` are already specified as managed account snapshot structures, and rebinding them to the flat key lists that `syncToBag` writes would break a documented contract. `missing-accounts` is not addressable in a Velocity reference at all because of the hyphen. `history` has no stated use case. Only the three names with a real use case and no existing meaning in the context are exposed.

**Q5 — Should reviewer registration move earlier so Normal definitions see it too?**
No. `initializeSourceReviewers()` runs at the end of `processIdentities()`, after each freshly created identity-origin account has already run Map and Define, so a new global reviewer's Normal definitions stay one aggregation behind. Closing that gap properly means running reviewer registration before `processFusionAccounts` in the Refresh phase, which is the area a prior fix already had to guard ("a global reviewer Fusion account from a prior run can be marked orphan when the owner sits outside identityScopeQuery"). That is a failure-semantics and ordering decision with its own blast radius, and the driving use case does not need it: unique definitions evaluate in the Output phase, after reviewer registration. Deferred to its own change; this change documents the asymmetry.

Persisted accounts are unaffected by the gap — `processFusionAccount` calls `applyReviewerLayersToFusionAccount` before `applyAttributeProcessing`, so a reviewer identified by a persisted `reviewer:<sourceId>` action is live in the context for Normal definitions already.

**Q6 — Should a `$isReviewer` flag ship with this?**
No — deliberately declined. The context gains data, not derived predicates. The trap it would have hidden gets documented instead (Q7).

**Q7 — Does the obvious expression actually work in our engine?**
Not the obvious spelling. Verified directly against `velocityjs` 2.1.6 with an array context value: `$statuses.contains("reviewer")` renders false silently, `isEmpty()` renders the unresolved literal, while `$statuses.includes("reviewer")`, `$statuses.indexOf("reviewer") >= 0`, `$statuses.size()`, and `#foreach` all behave. Java Velocity users will reach for `contains` first, so the reference documentation must state this.

**Q8 — Does this churn existing accounts?**
No. `processUniqueDefinition` returns early when a unique attribute already holds a value and the account is not being reset, so a Fusion account that already has an `id` keeps it. Live state matters at creation and at reset, which is exactly where the persisted snapshot is missing or stale.

**Q9 — Does `$previous` change meaning?**
No. `context.previous` is `attributeBag.previous`, which this change does not touch, so `$previous.statuses` remains the prior-run value and becomes the documented way to ask for it.

## Open questions

None blocking.

**Whether Normal definitions should also see reviewer status on the run a reviewer account is created** — deferred per Q5 to a change that owns reviewer-registration ordering.

**Whether `history` or the account-id sets should ever be exposed** — deferred per Q4; no use case today, and two of the candidate names are already bound to snapshot structures.

## Scenarios discussed

- First aggregation, identity-origin Fusion account for a global reviewer, Unique `id` definition branching on the `reviewer` status: the context reports `reviewer`, the definition emits a UUID, and the account is output. This is the driving case.
- Same aggregation, identity-origin Fusion account for a non-reviewer: statuses report `baseline` and `new` but not `reviewer`, `id` renders empty, and `skipAccountsWithMissingId` suppresses the account.
- Persisted reviewer Fusion account that already holds an `id`: the unique definition is not re-evaluated and the value is preserved, regardless of context contents.
- Persisted reviewer Fusion account being reset through disable then enable: live statuses include `reviewer`, so the regenerated `id` is a fresh UUID rather than empty.
- Persisted Fusion account carrying a `reviewer:<sourceId>` action, Normal definition reading `$actions`: the action is live in the context because reviewer layers are applied before attribute processing.
- Newly created identity-origin global reviewer, Normal definition reading `$statuses`: `reviewer` is absent this run because registration happens after the identity Define pass. Documented limitation, guarded by a scenario so the behavior is deliberate rather than accidental.
- Persisted Fusion account whose bag carries last run's `statuses` while the current run has already added a status: the template sees the live value, proving own-property shadowing of the inherited snapshot.
- Fusion account with an empty reviews collection and no persisted `reviews` attribute: `$reviews` is an empty list rather than an unresolved reference.
- Define runs with the live keys present: `fusionAccount.attributes.statuses` is not written by Define, so nothing reaches the persisted account before `syncCollectionAttributesToBag` at output.
- A Normal definition literally named `statuses`: its own sequential write into the context still wins for later definitions, matching existing behavior for definition names that collide with context keys.
- `$previous.statuses` on a persisted account: still the prior-run snapshot, unchanged by this change.
