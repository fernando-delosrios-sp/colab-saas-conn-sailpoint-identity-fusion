# Brainstorm: Hydrate correlated identity aliases

<!--
Raw capture of the brainstorming conversation for this change.

Format: decision log (background → decision chain Q1-Qn → design trade-offs).
This file is a raw capture. design.md is a separate structured redesign of the
same content (Context, Goals, Decisions, Risks, Migration). Do not duplicate.
-->

## Background

After publishing the `align-identity-naming-ubiquitous-language` change, three
distinct identity-related names are defined in the ubiquitous-language spec:

- **Identity alias** — top-level `displayName` field of the SDK's `IdentityDocument`.

  The single value the Fusion display attribute override SHALL consume.

- **Identity name** — human-friendly fallback chain

  (`IdentityDocument.attributes.displayName` → `IdentityDocument.name` →
  `FusionAccount.name`). Used in reports, review forms, emails, logs.

- **Fusion account name** — `state.name`. Internal-only: logs, history, conflict

  tracking.

The current code violates this for the managed-account path:

1. `buildIdentityInfo` populates `IdentityInfo.name` from `IdentityDocument.name`

   (the login) and `IdentityInfo.displayName` from the authoritative SDK
   `displayName`. Correct in isolation.

2. `addIdentityLayer` only runs for identities already loaded into

   `run.allIdentities` at the time the managed-account sweep processes the account.

3. `IdentityService.fetchIdentities` loads identities using only the configured

   `identityScopeQuery`. A managed account whose correlated identity falls outside
   the scope is never hydrated, so its identity layer never lands.

4. `applyDisplayAttributeOverride` writes `fusionAccount.identityName` (the login)

   to the display attribute instead of the identity alias.

End result: for a managed account correlated to an identity whose `displayName`
differs from the login, the Fusion display attribute shows the login (when the
identity is loaded) or the source account's name (when it is not). The
authoritative display name is never reached.

## Decision chain

### Q1: How should we ensure correlated identities are loaded before the managed-account sweep?

User chose: **Hydrate via existing `hydrateMissingIdentitiesById`.** Surgical —
only correlated identities, not a widened global scope. Existing method already
chunks at 50 IDs, runs batched parallel, isolates per-batch errors.

Alternatives rejected:

- Extend `identityScopeQuery` with `@accounts(...)` OR-clause per source —

  widens global identity set, can pull tens of thousands of unrelated identities.

- Per-source parallel `@accounts(source.id:<id>)` searches — N+1 search calls.

### Q2: Where should the authoritative identity alias value come from?

User chose: **Add `identityAlias` accessor and switch the override to consume
it.** Plus make sure the hydration path (Q1) populates `addIdentityLayer` for
correlated managed accounts.

Alternatives rejected:

- Make `addIdentityLayer` set `state.name` from identity alias — violates the

  new spec by collapsing Fusion account name with identity alias.

- Add separate `fusionAliasAttribute` schema field — parallel config surface,

  no benefit.

### Q3: When does the hydration + addIdentityLayer call happen, and how does the display attribute get re-evaluated?

User chose: **Pre-managed-sweep hydration + deferred override.** Split into
reasonable-length filter chunks to avoid query overflow.

After the self-review the design was tightened: the explicit re-evaluation
pass was dropped because `getISCAccount` already calls
`setCoreSchemaAttributes` → `applyDisplayAttributeOverride` lazily before
serialization. Once `identityInfo` is populated, the next `getISCAccount` call
writes the alias automatically.

Alternatives rejected:

- Lazy resolution at write time without hydration — same as the original bug.
- Single re-evaluation pass before hydration — useless, alias is empty.

## Design trade-offs

- **Hydration cost on large sources.** For 50k correlated identities,

  hydration is 1000 batches × paginated search. Bounded by per-source identity
  footprint. Per-batch error isolation and the existing `BATCH_SIZE = 50` are
  already tuned.

- **Race with new in-run correlations.** A managed account that becomes

  correlated during this run (via the correlation sweep) is not in
  `run.allManagedAccounts` at hydration time. The correlation sweep already
  calls `addIdentityLayer` and the display-attribute override is re-evaluated
  via the same lazy path.

- **Order of pipeline phases.** If `addIdentityLayer` is called after any

  `getISCAccount` serialization for the affected accounts, the alias is empty.
  Pipeline ordering is explicit; the integration test pins the order.

## Validation

Three forks were resolved in turn. The user reviewed the verbal design,
approved it, and asked to proceed. The design doc was committed to
`docs/superpowers/specs/2026-07-22-hydrate-correlated-identity-aliases-design.md`.
A self-review found one tightening (drop the explicit re-evaluation pass in D4
because the lazy override at `getISCAccount` already covers it).
