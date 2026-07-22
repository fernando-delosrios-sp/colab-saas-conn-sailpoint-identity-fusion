# Hydrate correlated identity aliases

## Why

The `align-identity-naming-ubiquitous-language` change defined `identity alias` as the authoritative account name (the SDK top-level `displayName` of the `IdentityDocument`) and specified that the Fusion display attribute override SHALL consume it. The code today consumes `fusionAccount.identityName`, which resolves to `IdentityDocument.name` (the login) rather than the SDK top-level `displayName`. For a managed account correlated to an identity, the value written to the display attribute is the login or the source account's name — never the authoritative display name. This change wires the override to the new accessor and guarantees the correlated identity is loaded so `addIdentityLayer` populates `identityInfo` before the override evaluates.

## What Changes

**Display attribute value source**

- From: `applyDisplayAttributeOverride` writes `fusionAccount.identityName` (login or source name).
- To: `applyDisplayAttributeOverride` writes `fusionAccount.identityAlias` (SDK top-level `displayName`).
- Reason: matches the new ubiquitous-language spec.
- Impact: behavior change for managed accounts correlated to identities whose `displayName` differs from the login; identity-origin accounts unchanged.

**Correlated identity hydration**

- From: only identities matching the configured `identityScopeQuery` are loaded.
- To: after the managed-source aggregation phase, identities correlated to fetched managed accounts are also hydrated via the existing `hydrateMissingIdentitiesById` (50-ID chunks, batched parallel).
- Reason: without the correlated identity in `run.allIdentities`, `addIdentityLayer` never runs and the override has no alias to write.
- Impact: surgical; no global scope widening.

**Identity layer application for managed-origin accounts**

- From: `addIdentityLayer` only runs for identity-origin or already-scoped identities.
- To: after hydration, `addIdentityLayer` runs for every FusionAccount whose `state.originAccount` is a managed account whose `identityId` is now in `run.allIdentities` and whose `state.identityInfo` is undefined.
- Reason: same as above — the override needs `identityInfo` populated.
- Impact: scope-limited; only affects correlated managed accounts.

## Capabilities

### New Capabilities

- `identity-hydration`: pre-managed-sweep hydration of correlated identities so `addIdentityLayer` can populate `identityInfo` for managed-origin Fusion accounts.

### Modified Capabilities

- `ubiquitous-language`: clarifies that the Fusion display attribute override SHALL consume `identity alias` (no new requirement; the existing `Fusion display attribute override uses the identity alias` requirement already mandates this; this change makes the code honor it).

## Impact

- `src/model/fusionAccountAccessors.ts` — new `identityAlias` getter.
- `src/services/definitionService/definitionService.ts` — `applyDisplayAttributeOverrideIfApplicable` switches to `identityAlias`; log message updated.
- `src/operations/helpers/corePipeline.ts` — new pass after managed-source aggregation: collect distinct `identityId`s from `run.allManagedAccounts`, call `identities.hydrateMissingIdentitiesById`, then call `addIdentityLayer` on the affected FusionAccounts.
- Tests updated: `applyDisplayAttributeOverride` assertions; new unit test for `identityAlias`; new unit test for the pipeline hydration pass; new chain-harness scenario.
- Existing `IdentityService.hydrateMissingIdentitiesById` is reused (no new method).
- No SDK/API changes. No schema field changes. No configuration surface changes.
