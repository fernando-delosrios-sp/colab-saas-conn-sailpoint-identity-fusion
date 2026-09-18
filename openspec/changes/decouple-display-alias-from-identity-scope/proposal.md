## Why

Aggregating an authoritative source whose managed source accounts are already correlated produces Fusion accounts labelled by an attribute definition instead of the identity alias, whenever **Include identities in the scope?** is off. The alias is available at that moment — it arrives on the managed source account payload and through the unconditional orphan-identity hydration phase — so the connector is discarding a name it already holds in favour of a generated one.

The cause is that `identityInputsEnabled` gates two unrelated concerns behind one setting: what Velocity may read, and how a Fusion account is labelled. Identity scope should govern the first only. Splitting them makes display names stable for correlated populations without widening identity scope or adding API calls.

## What Changes

**Display attribute override under disabled identity scope**

- From: when `includeIdentities` is `false`, the display attribute override is suppressed for every managed-origin Fusion account, so Normal and Unique definitions own `fusionDisplayAttribute` even on accounts the platform has already correlated.
- To: the override still applies to managed-origin Fusion accounts with a correlated managed origin (originating managed source account `uncorrelated === false`), using the identity alias. Uncorrelated managed-origin Fusion accounts are unchanged.
- Reason: the identity alias is a naming contract for an identity the account already belongs to, not identity context fetched because identity scope was enabled.
- Impact: non-breaking for identity scope on. For identity scope off, newly created Fusion accounts for correlated managed source accounts take the alias where they previously took definition output. Persisted Fusion accounts keep their existing display values, as they already do.

**Identity context under disabled identity scope**

- From / To: unchanged. The identity bag, `$identity.*`, the identity alias as a Velocity value, and the `Identities` origin snapshot stay excluded from managed-origin Fusion accounts.
- Reason: this is what the setting is for, and its label and help text describe exactly this.
- Impact: none; covered by regression scenarios so the split does not leak identity data into Define.

**Alias unavailable**

- From: not reachable, because the override never ran with identity scope off.
- To: when no alias resolves for a correlated managed origin, the override must not blank the attribute — evaluation falls through to definition output and then to the existing safe default.
- Reason: the override becomes reachable on a path where the identity may not have been hydrated.
- Impact: non-breaking; prevents an empty display attribute.

Carried forward from discovery: relabelling Fusion accounts that were already persisted with a definition-generated display value is **not** addressed here. It depends on the `buildFromFusionAccount` / `buildFromManagedAccount` disagreement over `isIdentity`, which is a separate defect affecting runs with identity scope enabled as well, and belongs in its own change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `definition-service`: the requirement "Disabled identity scope excludes identity data from Define" is narrowed. It keeps excluding the identity bag, identity alias, and Identities origin snapshot from the Velocity context, and stops disabling the display attribute override for correlated managed origins. Adds scenarios for alias precedence over Unique and Normal display definitions with identity scope off, for the unavailable-alias fallback, and regression scenarios proving identity context and uncorrelated managed-origin behavior are untouched.

## Impact

**Code**

- `src/services/definitionService/definitionService.ts`: `shouldApplyDisplayAttributeOverride` stops delegating its first gate to `identityInputsEnabled`. `buildVelocityContext` and `ensureCoreSchemaAttributes` keep using `identityInputsEnabled` unchanged.

**Tests**

- `src/services/definitionService/__tests__/defineService.test.ts`: new cases for identity scope off across Unique and Normal display definitions, correlated and uncorrelated managed origins, and the unavailable-alias fallback. Existing identity-scope-off Define cases stay as regression guards.

**Documentation**

- `docs/use-guides/configuration/configuring-sources-and-scope.md`: the "When disabled" list states that the display attribute override still uses the identity alias for correlated managed source accounts.
- `docs/use-guides/configuration/defining-attributes.md`: note that a display-attribute definition does not win over the alias on correlated accounts, independently of identity scope.
- `CHANGELOG.md` via **changelog-generator**.

**Not affected**

- `mapping-service` — Map behavior under disabled identity scope is unchanged.
- `ubiquitous-language` — no new canonical terms; **identity alias**, **managed-origin Fusion account**, and **identity scope** are used with their existing definitions.
- ISC API surface, connector spec settings, and PAT scopes — no new calls, fields, or permissions.
