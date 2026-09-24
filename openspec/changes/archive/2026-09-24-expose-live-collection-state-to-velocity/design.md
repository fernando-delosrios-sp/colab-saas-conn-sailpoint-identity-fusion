## Context

`DefinitionService.buildVelocityContext` builds the caller context as `Object.create(fusionAccount.attributeBag.current)` and then assigns a fixed set of own properties (`identity`, `accounts`, `previous`, `sources`, `account`, `originSource`, `originAccount`). The prototype trick is deliberate and already specified: the requirement *DefinitionService Velocity caller context does not clone the current bag* forbids shallow-copying the bag and names those keys as own properties that must shadow same-named bag attributes.

`statuses`, `actions`, and `reviews` are not in that set, so they resolve through the prototype to the attribute bag. The bag receives them only from `syncToBag`, whose aggregation-path caller is `getISCAccount` — which runs *after* `refreshUniqueAttributes` in `processOutputBatch`. A template therefore reads the previous aggregation's values on a reloaded account, and nothing on an account created this run.

The live values are already public on the model: `FusionAccount.statuses`, `.actions`, and `.reviews` each return an array built from the corresponding `FusionCollections` set. The gap is purely that Define does not bind them.

Constraints this design accepts as given: `syncCollectionAttributesToBag` remains the only writer of collection state into the attribute bag; the render context built by `evaluateVelocityTemplate` keeps its null prototype and helper-override precedence; `$previous` keeps pointing at `attributeBag.previous`.

## Goals / Non-Goals

**Goals:**

- Definitions can test this run's `statuses`, `actions`, and `reviews`, including on a Fusion account created during the same aggregation.
- A Unique definition that emits a value only for reviewer accounts works on the first aggregation, unblocking the reviewer-only account pattern paired with `skipAccountsWithMissingId`.
- One seam, so every Define entry point benefits without caller-side ordering knowledge.
- No new persisted behavior: what lands on the ISC account is byte-identical to today.

**Non-Goals:**

- Exposing account-id sets, `missing-accounts`, `sources`, or `history`.
- Any derived predicate or helper such as a reviewer flag.
- Changing when reviewer registration runs relative to the Process-phase Define pass.
- Relabelling or reprocessing Fusion accounts that already hold a unique value.

## Decisions

### D1: Bind live collection state as own context properties

- **Choice**: In `buildVelocityContext`, assign `context.statuses`, `context.actions`, and `context.reviews` from the `FusionAccount` getters, alongside the existing own-property assignments.
- **Reason**: Own properties shadow the inherited persisted snapshot, which is exactly the mechanism the existing caller-context requirement already relies on for `identity` and friends. It is read-only with respect to the model, needs no phase knowledge, and applies to Normal and Unique definitions and to every operation that runs Define.
- **Considered alternatives**: Calling `syncCollectionAttributesToBag()` before `refreshUniqueAttributes` in `processOutputBatch` — rejected because it mutates persisted state earlier than output to satisfy a read-only need, pushes Define's context requirements into an output-batching helper, and repairs only the `accountList` path. Passing collections into `evaluateAttributeTemplate` as a separate argument — rejected because it forks the context contract and every definition site would have to opt in.

### D2: Three names only

- **Choice**: `statuses`, `actions`, `reviews`.
- **Reason**: These are the collections with a real use case and no existing meaning in the context. `accounts` and `sources` are already bound to managed account snapshot structures and rebinding them would break a documented contract; `missing-accounts` cannot be referenced in Velocity because of the hyphen; `history` has no use case.
- **Considered alternatives**: A single `$collections` namespace object — rejected as a second addressing convention for data the context already exposes flatly, and it would leave `$statuses` silently stale, which is the trap this change exists to remove.

### D3: Arrays, matching the getters

- **Choice**: Expose the existing `string[]` values, not the underlying `ReadonlySet`.
- **Reason**: `velocityjs` resolves array methods (`includes`, `indexOf`, `size`) but a `Set` exposes none of the idioms a template author would try, and `syncToBag` already persists these as arrays, so the live and persisted shapes stay identical. A template that migrates from the stale value to the live one sees no shape change.
- **Considered alternatives**: Sets — rejected per above. Comma-joined strings — rejected because it would diverge from the persisted multi-valued shape.

### D4: Leave reviewer-registration ordering alone

- **Choice**: Do not move `initializeSourceReviewers()`; specify the resulting timing gap instead.
- **Reason**: Unique definitions evaluate in the Output phase, after reviewer registration, so the driving use case is satisfied. Normal definitions for an identity-origin account created this run evaluate inside `processIdentities()` before registration, so a brand-new global reviewer's Normal definitions stay one aggregation behind. Closing that would mean registering reviewers before `processFusionAccounts` in the Refresh phase — the area a prior fix already had to guard against global reviewer accounts being marked orphan — which is a separate ordering and failure-semantics decision.
- **Considered alternatives**: Moving registration ahead of `processIdentities` — rejected as a half fix that still misses persisted global reviewers refreshed earlier, for a benefit nothing needs today.

### D5: Document the engine caveat instead of hiding it behind a helper

- **Choice**: State in `docs/reference/velocity-context.md` that `contains()` and `isEmpty()` do not resolve against array values in `velocityjs`, and show `includes()`, `indexOf() >= 0`, `size()`, and `#foreach` as the supported idioms.
- **Reason**: Verified against `velocityjs` 2.1.6: `$statuses.contains("reviewer")` renders false silently and `isEmpty()` renders the unresolved literal. Java Velocity authors will try `contains` first, and a silent false is the worst possible failure mode. Documenting it is in scope; adding a predicate helper was explicitly declined.
- **Considered alternatives**: An `$isReviewer` boolean or a `$Lists.contains` helper — both out of scope for this change; revisit only if the documented idioms prove insufficient in practice.

## Risks / Trade-offs

[Risk] An existing tenant expression reading `$statuses`, `$actions`, or `$reviews` silently changes meaning from last run's snapshot to this run's live values. → Mitigation: for Unique definitions the blast radius is creation and reset only, since a populated unique attribute is preserved; `$previous.*` is documented as the explicit way to read the prior snapshot; the behavior change is called out in the reference documentation and the changelog.

[Risk] A Normal definition named `statuses`, `actions`, or `reviews` now collides with a live context key rather than a bag key. → Mitigation: existing sequential-write behavior already has the definition's own output win for later definitions; a scenario pins it so the precedence is deliberate.

[Risk] Reading collections during Define could tempt future code to mutate them there. → Mitigation: only the array-returning getters are used, and a scenario asserts Define does not write collection state into `fusionAccount.attributes`.

[Trade-off] Normal definitions on a freshly created global reviewer account remain one aggregation behind. → Accepted per D4: the alternative reorders reviewer registration through a known-fragile part of the Refresh phase, and the driving use case is served by unique-definition timing.

[Trade-off] Three flat names rather than a namespaced object. → Accepted per D2: consistency with the existing flat context surface beats a new convention, and it removes the stale-`$statuses` trap rather than preserving it.

## Migration Plan

N/A — no deployment, schema, or configuration change. The connector bundle ships the new context binding; existing configurations keep working, and tenants that want the reviewer-only pattern update their `id` expression afterwards.

Acceptance: `npm test` green, `npm run lint` clean, and a replay of `recordings/company24509-poc/orphan` in which a reviewer-gated `id` expression yields Fusion accounts for the reviewer identities and none for the rest.

## Open Questions

None blocking. Carried forward from discovery: whether Normal definitions should also see reviewer status on the run the account is created (deferred to a reviewer-ordering change), and whether `history` or the account-id sets should ever be exposed (no use case today).
