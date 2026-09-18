## Scope

Let the Fusion display attribute override use the identity alias on correlated managed-origin Fusion accounts even when `includeIdentities` is `false`, while leaving the identity bag, identity alias, and Identities origin snapshot excluded from the Velocity context exactly as they are today.

Out of scope: any change to identity data blending in Map or Define, any change to uncorrelated managed-origin Fusion accounts, and the separate `buildFromFusionAccount` / `buildFromManagedAccount` disagreement over `isIdentity` (tracked as a follow-up change).

## Language

**Display attribute override** (`draft`):
The rule that writes the identity alias into `fusionDisplayAttribute` on a Fusion account that belongs to an ISC identity, in preference to any Normal or Unique definition output for that attribute. The canonical glossary already names the identity alias as the only value used for this override; this change gives the override itself a name so specs can talk about it separately from identity data blending.
_Avoid_: display name override, identity name override, alias mapping

**Identity context** (`draft`):
The identity-derived data that Define exposes to Velocity — `$identity.*`, the identity bag, and the `Identities` origin snapshot. This is what `includeIdentities` is meant to gate. It is distinct from the display attribute override, which is a naming contract rather than a data source.
_Avoid_: identity inputs, identity blending, identity scope (identity scope is canonical for which identities are fetched, not for what Define can read)

**Correlated managed origin** (`draft`):
A managed-origin Fusion account whose originating managed source account reports `uncorrelated === false` — the platform already links that account to an ISC identity, independently of whether the connector fetched any identities. Surfaced today as `FusionAccount.isIdentity`.
_Avoid_: correlated account (canonical for the managed source account itself), fusion identity (canonical for a Fusion account correlated to an identity), orphan correlated managed account (see below)

**Correlated authoritative managed account** (`draft`):
A managed source account on an Authoritative-type source with `uncorrelated === false`. This is the population that motivated the change. Naming it by source type and correlation state avoids the `fusion-run` spec's "orphan correlated managed account", which is self-contradictory — a correlated account has an identity and so cannot be an orphan — and which collides with two canonical senses of **Orphan** (a Fusion account with no contributing managed source accounts, and the Orphan source type).
_Avoid_: orphan correlated managed account, orphan correlated account, correlated orphan

Conflict-check against `openspec/specs/ubiquitous-language/spec.md`: **identity alias**, **managed-origin Fusion account**, **identity-origin Fusion account**, **correlated account sweep**, and **identity scope** are canonical and used here with their canonical meanings. No term in this change conflicts with canonical vocabulary.

No term is marked `promote` — all three are local vocabulary for stating the requirement and do not need to enter the canonical glossary.

## Decisions

**Context.** An authoritative source was aggregated whose managed source accounts were all already correlated on the platform. A Unique attribute definition for `FusionDisplayName` produced the display value instead of the identity alias. `includeIdentities` is `false` on that configuration.

**Q1 — Is this a regression of the July fix (`9d0a8aea`, `1dbc930e`)?**
No. Both commits are intact and still work: a Fusion account built fresh from a correlated managed source account with identity scope enabled resolves the alias correctly (verified against the real `DefinitionService`). `aad404db` later added an `identityInputsEnabled` guard as the first line of `shouldApplyDisplayAttributeOverride`, which returns `false` before `isIdentity` is consulted. The same commit added the sentence "Identity-derived display-attribute overrides SHALL also be disabled for those Fusion accounts" to the definition-service spec. This is a deliberate rule, not an accident, which is why the change goes through a proposal rather than a direct PR.

**Q2 — Should identity scope govern the display attribute override?**
No. `identityInputsEnabled` currently conflates two concerns: identity context (what Velocity may read) and the display attribute override (how a Fusion account is labelled). Turning off identity scope should suppress the first, because that data exists only because identities were fetched. The second is a naming contract about the identity an account already belongs to. Chosen direction: split the two, keeping the identity-context exclusion byte-for-byte and narrowing only the override branch.

**Q3 — Is the alias actually available when identity scope is off?**
Only through one path: a hydrated `IdentityDocument` reaching `addIdentityLayer`, which rebuilds `identityInfo` so `identityAlias` returns `IdentityDocument.name`. The hydration step in `accountListPhases.ts` runs unconditionally, before the correlated account sweep and regardless of `includeIdentities`, and `preScoreGate` reads `run.getIdentity(identityId)` and applies the layer. Because that step already runs today, the override costs no extra API calls and does not widen identity scope.

Crucially, that step is scoped by **linkage, not source type**. `openspec/specs/fusion-run/spec.md` limits it to correlated managed source accounts still on the work queue after refresh, and states: "The connector SHALL NOT perform this hydration pass for managed accounts already linked to an existing Fusion account." Coverage therefore splits — see Q7.

The managed source account payload is **not** a second source for the alias. `AccountAllOfIdentityV2025.name` is documented by the SDK as "display name of identity", so `account.identity.name` carries the identity display name, not the alias. `buildIdentityInfo` nonetheless places it in the alias slot — see Q7.

**Q3a — Is "orphan correlated managed account" the right name for this population?**
No, and the term should not be propagated by this change. `openspec/specs/ubiquitous-language/spec.md` defines **Orphan** as "a Fusion account that no longer has any contributing managed source accounts", defines **Orphan accounts** as a source type, and explicitly protects the word — it forbids "orphaned attribute" as a synonym for vanished snapshot key on the grounds that "**Orphan** already denotes a Fusion account with no contributing managed source accounts". The `fusion-run` requirement introduces a third, self-contradictory sense: an account that is correlated, and therefore has an identity, cannot be an orphan. The population this change cares about is **correlated authoritative managed accounts** — accounts on an Authoritative-type source with `uncorrelated === false`. Renaming the `fusion-run` vocabulary is a separate concern from this change's behavior, but this change's own specs SHALL use the accurate term.

**Q7 — Is the hydration guarantee enough for correlated authoritative managed accounts?**
For the population this change touches, yes — but only because of how it interacts with Q6, and the margin is thin.

Coverage splits by whether the managed source account is already linked to a loaded Fusion account:

- **Not linked** (first aggregation of the source, or an account Fusion has not yet claimed): the account stays on the work queue, hydration runs, `preScoreGate` applies the identity layer, and the new Fusion account comes from `buildFromManagedAccount` with `isIdentity === true`. This is the population this change makes override-eligible, and its alias is correct.
- **Already linked** (steady state, Fusion account persisted from a prior run): the hydration requirement deliberately skips it. The identity layer then depends on `applyIdentityLayerForFusionAccount`, which reads only the run-scoped cache via `getIdentityById`. With `includeIdentities` off, `fetchIdentities` returns early and that cache is empty, so no identity document exists and no layer is applied.

The second bullet does not bite **in this change** only because Q6 leaves `buildFromFusionAccount` setting `isIdentity = fromIdentity`, so persisted managed-origin Fusion accounts are not override-eligible at all. The two populations happen to line up: everything this change makes eligible is hydration-covered.

That makes the Q6 follow-up **blocked** on resolving the alias source. The moment `buildFromFusionAccount` honors `uncorrelated === false`, persisted correlated Fusion accounts become override-eligible while having no identity document with identity scope off — and `identityAlias` is not empty in that state. `buildIdentityInfo`'s Account branch assigns `account.identity?.name` to `name` (the alias slot), and tenant recordings confirm that field is always populated and always carries an identity display name such as `"J. Marcus [Umbrella Corporation]"`. `a0d59e38` fixed only the `IdentityDocument` side of that chain. Fixing Q6 without fixing the alias source would label steady-state Fusion accounts with display names.

The same non-empty-but-wrong alias also surfaces inside this change's own population in two spec'd carve-outs, but neither is introduced here:

- **Protected hydrated identity.** The hydration requirement withholds the identity layer, yet the override still applies that identity's display name from the payload. Verified against the real `DefinitionService`: with identity scope **on** this already happens today, producing `FusionDisplayName = "J. Marcus [Umbrella Corporation]"`. With identity scope off it currently yields the definition value. So this change widens the reach of a pre-existing defect rather than creating one, and the defect is orthogonal to the identity-scope decision. Recorded as a known limitation; not a blocker.
- **Hydration chunk lost to per-chunk error isolation.** Treated as a resilience defect rather than an alias question — see Q8.

The display name chain reading `account.identity.name` is legitimate; only its presence in the alias chain is the defect.

**Q8 — Should a hydration chunk that cannot be recovered fail the aggregation?**
Yes. Today `hydrateMissingIdentitiesById` catches per-chunk errors and logs at `debug`, and `openspec/specs/fusion-run/spec.md` mandates that behavior ("execute the chunked queries in parallel with per-chunk error isolation"). The consequence is silent: up to 50 correlated accounts get labelled from a definition because one search call failed, with nothing visible above `debug`. That contradicts the principle already established in the `2026-07-23-resilient-report-epilogue` design — "ISC must not treat partial output as a complete aggregation, but the failure must be reported first."

Changing it means amending the `fusion-run` hydration requirement, not just the helper. Direction: raise as its own change, since it is a failure-semantics decision about the hydration capability rather than a display-attribute decision, and it would otherwise widen this change's blast radius into resilience behavior. Resolving it removes this carve-out from the list above entirely.

**Q4 — Which accounts change behavior?**
Only managed-origin Fusion accounts with `isIdentity === true` (originating managed source account `uncorrelated === false`). Uncorrelated managed-origin Fusion accounts continue to take their display value from mapping and definitions, which is the behavior `9d0a8aea` deliberately established. Identity-origin Fusion accounts, including those created for global reviewers, are unaffected because `fromIdentity` already short-circuits the guard.

**Q5 — Should the override be a new setting?**
No. A per-behavior toggle adds configuration surface for a naming contract that has one defensible answer. The existing `includeIdentities` setting keeps its meaning for identity context, which is what its label and help text describe.

**Q6 — Should the `buildFromFusionAccount` / `buildFromManagedAccount` `isIdentity` asymmetry be fixed here?**
No. `buildFromFusionAccount` sets `isIdentity = fa.fromIdentity` and ignores `account.uncorrelated === false`, so a Fusion account reloaded from a prior run never qualifies for the override regardless of identity scope. That is an independent defect with its own blast radius (it affects runs with identity scope enabled too) and belongs in its own change. Per Q7, that follow-up is blocked on resolving where the alias comes from for Fusion accounts with no hydrated identity document.

## Open questions

**Where the alias comes from when no identity document was layered** — **not blocking for this change**, blocking for the Q6 follow-up. `buildIdentityInfo` assigns `account.identity?.name` to the alias slot, so `identityAlias` returns an identity display name rather than being absent whenever no identity document was layered. Inside this change that is confined to the two carve-outs in Q7, both pre-existing with identity scope on and neither made worse in kind. In the Q6 follow-up it stops being an edge case and becomes the steady state, because persisted correlated Fusion accounts have no identity document at all when identity scope is off. Candidate directions: drop `account.identity.name` from the alias chain in `buildIdentityInfo` while keeping it in the display name chain, so the alias is genuinely absent without an identity document; or gate the override on an identity layer having been applied rather than on `identityAlias` being truthy. The first is a narrow correctness fix whose consumers are five call sites, four of them in `DefinitionService`; the second keeps the blast radius inside `DefinitionService` but leaves the polluted alias slot in place for other readers.

**Whether unrecoverable hydration failures should fail the aggregation** — deferred to its own change per Q8. Non-blocking here; resolving it there removes one of this change's two known carve-outs.

**Whether the `fusion-run` "orphan correlated managed account" vocabulary should be corrected** — deferred, non-blocking for this change's behavior. Per Q3a the term contradicts two canonical senses of **Orphan**. This change avoids the term in its own specs; renaming it in `openspec/specs/fusion-run/spec.md` and the `orphan-identity-hydration` step name touches an archived requirement and a logged step name, so it belongs in a vocabulary change of its own.

**Remediation of Fusion accounts already labelled by a definition** — deferred to the follow-up change covering Q6. A persisted Fusion account keeps its existing display value by design, and separately fails the `isIdentity` test, so this change cannot relabel accounts created while the override was suppressed. Whether relabelling should happen at all, and whether it should require Reset accounts or force attribute refresh, is a question for that change.

## Scenarios discussed

- Identity scope off, correlated managed origin, Unique definition for the display attribute: the alias wins. This is the reported defect.
- Identity scope off, correlated managed origin, Normal definition for the display attribute: the alias wins, on the same branch in `processNormalDefinition`.
- Identity scope off, correlated managed origin, Velocity expression reading `$identity.department`: still absent. Regression guard proving identity context stayed excluded.
- Identity scope off, correlated authoritative managed account not yet linked to a Fusion account, identity hydrated and layered: the alias is `IdentityDocument.name` and the override uses it. This is the normal path and the population this change makes eligible.
- Identity scope off, correlated authoritative managed account already linked to a persisted Fusion account: hydration is skipped by the `fusion-run` requirement and no identity layer is applied. The persisted Fusion account must remain override-ineligible while Q6 stands, so its display value is unchanged. Boundary guard for the Q6 follow-up.
- Identity scope off, correlated authoritative managed account on a `protected` identity: the override applies the payload display name, matching what identity scope on already does today. Documented as a known pre-existing limitation, not a scenario this change fixes.
- Identity scope off, uncorrelated managed origin with an identity layer attached: the definition value wins, unchanged from `9d0a8aea`.
- Identity scope off, `Identities` origin snapshot on a managed-origin Fusion account: still excluded from `$sources`, unchanged.
- Identity scope on, correlated managed origin: unchanged. Regression guard for the July fix.
- Identity-origin Fusion account created for a global reviewer while identity scope is off: retains its own identity context and its alias, unchanged.
