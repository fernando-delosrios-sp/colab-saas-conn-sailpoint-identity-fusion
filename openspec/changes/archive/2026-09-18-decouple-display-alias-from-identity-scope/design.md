## Context

`shouldApplyDisplayAttributeOverride` currently returns false whenever `identityInputsEnabled` is false. That helper is also the gate for Velocity identity data (`$identity.*`, the identity bag, the `Identities` origin snapshot). The two concerns were bound together in `aad404db`, so a correlated managed-origin Fusion account with `includeIdentities` off is labelled by a Normal or Unique definition instead of the identity alias.

The alias is already on the path this change cares about: hydration of correlated managed source accounts still on the work queue runs regardless of identity scope, and `preScoreGate` applies the identity layer before Define. No extra API calls and no widening of identity scope.

The population that changes is new Fusion accounts built from a correlated managed origin (`isIdentity === true`). Persisted Fusion accounts stay override-ineligible because `buildFromFusionAccount` sets `isIdentity` from `fromIdentity` only (Q6, out of scope).

## Goals / Non-Goals

**Goals:**

- Apply the display attribute override (identity alias into `fusionDisplayAttribute`) to correlated managed-origin Fusion accounts when identity scope is off.
- Keep identity context excluded from Define for managed-origin Fusion accounts when identity scope is off.
- When the override is eligible but no alias resolves, fall through to definition output, then to the existing core-schema safe default — never blank the display attribute.
- Leave uncorrelated managed-origin Fusion accounts on mapping and definitions.

**Non-Goals:**

- Fixing `buildFromFusionAccount` / `buildFromManagedAccount` disagreement over `isIdentity` (Q6). Persisted correlated Fusion accounts are not relabelled here.
- Changing where `buildIdentityInfo` sources the alias from `account.identity.name` (blocking for Q6, not this change).
- Failing aggregation on hydration chunk errors (Q8).
- Renaming `fusion-run` “orphan correlated managed account” vocabulary (Q3a).
- New connector settings, ISC API calls, PAT scopes, or Map-path identity blending.

## Decisions

### D1: Split the override gate from identity context

- **Choice**: `shouldApplyDisplayAttributeOverride` stops consulting `identityInputsEnabled`. Eligibility remains identity-origin (`fromIdentity` or `FusionAccountKind.Identity`) or managed-origin with `isIdentity === true`. `buildVelocityContext` and `ensureCoreSchemaAttributes` keep using `identityInputsEnabled` unchanged.
- **Reason**: identity scope governs what Velocity may read; the override is a naming contract for an identity the account already belongs to.
- **Considered alternatives**: keep the combined gate (status quo — the reported defect); add a separate setting for the override (rejected in discovery Q5 — one defensible answer, extra config surface).

### D2: Absent alias is not a successful override

- **Choice**: if the account is override-eligible but `identityAlias` is absent, do not treat the override as applied. Normal evaluation (`applyDisplayAttributeOverrideIfApplicable`) MUST return false so the definition runs. Unique evaluation MUST NOT return early on an empty alias. After definition output, `fusionAttributeSafeDefault` still covers an empty display attribute.
- **Reason**: the override becomes reachable on a path where hydration may have missed the identity. Returning “applied” without a label currently skips definition evaluation and can leave the attribute empty.
- **Considered alternatives**: keep returning true and relying on `ensureCoreSchemaAttributes` later (skips a configured definition that could have produced a value); invent a second alias source from `account.identity.name` (wrong field; deferred with Q6).

### D3: Eligibility stays `isIdentity`, not source type

- **Choice**: do not special-case Authoritative source type in `DefinitionService`. Authoritative correlated accounts are the motivating population, but the override already keys off correlation state (`uncorrelated === false` → `isIdentity`). Record/Orphan correlated origins that already set `isIdentity` keep the same naming contract.
- **Reason**: smallest change; matches existing tests for correlated vs uncorrelated managed origins.
- **Considered alternatives**: restrict the new identity-scope-off path to Authoritative sources only (narrower blast radius, but splits a single naming rule by source type without a product reason).

### D4: No new setting; identity scope help text is corrected, not expanded into a toggle

- **Choice**: `includeIdentities` continues to mean identity context only. Docs state that the display attribute override still uses the identity alias for correlated managed source accounts when the setting is off.
- **Reason**: discovery Q5.
- **Considered alternatives**: per-behavior toggle (rejected).

### D5: Document, do not fix, the protected-identity display-name carve-out

- **Choice**: a correlated origin whose identity is `protected` still skips the identity layer; the override may then see a payload display name in the alias slot. That already happens with identity scope on. This change may widen who hits it (identity scope off now reaches the override) but does not change kind. No code change here.
- **Reason**: orthogonal alias-source defect; fixing it belongs with the Q6 follow-up.
- **Considered alternatives**: gate the override on “an identity layer was applied” (keeps blast radius in `DefinitionService` but is a different product rule than `isIdentity` + truthy alias).

## Risks / Trade-offs

- [Risk] Splitting the gate could leak `$identity.*` or the `Identities` origin snapshot into Velocity when identity scope is off. → Mitigation: `identityInputsEnabled` stays on the context builders; regression scenarios for identity bag, alias-as-Velocity-value, and `Identities` snapshot.
- [Risk] Empty-alias fall-through changes Unique display-attribute generation (today the unique path returns without evaluating). → Mitigation: dedicated scenario and tests; Unique uniqueness rules still apply to definition output, not to a successful alias override.
- [Risk] Operators expect persisted Fusion accounts created under the old rule to pick up the alias. → Mitigation: explicit non-goal; persisted accounts remain `isIdentity === false` via Q6; docs and changelog say newly created accounts only.
- [Trade-off] Protected-identity and hydration-chunk-loss carve-outs remain. → Reason for acceptance: pre-existing with identity scope on; Q6/Q8 follow-ups own the fixes.
- [Trade-off] Record/Orphan correlated origins also become override-eligible with identity scope off. → Reason for acceptance: same `isIdentity` contract already used when identity scope is on.

## Migration Plan

N/A — no deployment, endpoint, or stored-data changes. Newly created Fusion accounts for correlated managed origins with identity scope off take the alias where they previously took definition output. Persisted Fusion accounts keep existing display values. Rollback = revert the change.

## Open Questions

None blocking. Deferred:

- Alias source when no identity document was layered — blocks Q6 follow-up only.
- Unrecoverable hydration failures failing the aggregation — own change (Q8).
- `fusion-run` “orphan correlated managed account” rename — own vocabulary change (Q3a).
- Relabelling Fusion accounts already labelled by a definition — owned by the Q6 follow-up.
