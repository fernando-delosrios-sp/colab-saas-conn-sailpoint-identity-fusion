# Design: Hydrate correlated identity aliases

## Context

After the `align-identity-naming-ubiquitous-language` change, the ubiquitous-language spec defines three distinct identity-related names:

- **Identity alias** — the authoritative account name, taken from the top-level `displayName` field of the SDK's `IdentityDocument`. The single value the Fusion display attribute override SHALL consume.
- **Identity name** — a human-friendly fallback chain (`IdentityDocument.attributes.displayName` → `IdentityDocument.name` → `FusionAccount.name`). Used in reports, review forms, emails, logs.
- **Fusion account name** — the `name` property of a `FusionAccount` (`state.name`). Internal-only: logs, history, conflict tracking.

The current code violates this for the managed-account path:

1. `buildIdentityInfo` (`src/model/fusionAccountUtils.ts:29`) populates `IdentityInfo.name` from `IdentityDocument.name` (the login) and `IdentityInfo.displayName` from the authoritative SDK `displayName`. Correct in isolation.
2. `addIdentityLayer` (`src/model/fusionAccountRules/layerRules.ts:55`) sets `state.identityInfo` and `state.isIdentity = true` but only runs for identities that are already loaded into `run.allIdentities` by the time the managed-account sweep processes the account.
3. `IdentityService.fetchIdentities` (`src/services/identityService.ts:104`) loads identities using only the configured `identityScopeQuery`. A managed account whose correlated identity falls outside the configured scope is never hydrated, so its identity layer is never applied.
4. `applyDisplayAttributeOverride` (`src/services/definitionService/definitionService.ts:213`) writes `fusionAccount.identityName` (the login) to the display attribute instead of the identity alias.

End result: for a managed account correlated to an identity whose `displayName` differs from the login, the Fusion display attribute shows the login (when the identity is loaded) or the source account's name (when it is not). The authoritative display name is never reached.

## Goals / Non-Goals

**Goals**

- For any managed account correlated to an identity, the Fusion display attribute value SHALL equal the **identity alias** (top-level `displayName` from the SDK's `IdentityDocument`).
- Preserve the new ubiquitous-language separation: `state.name` (Fusion account name) stays internal, `identityAlias` is the authoritative value the display attribute consumes, `identityName` remains the human-friendly fallback label.
- Hydration MUST be surgical: only correlated identities, not a widened global scope.
- The hydrated identity-id filter strings SHALL stay below a safe query length.

**Non-Goals**

- No change to SDK/API query syntax.
- No new schema field (no `fusionAliasAttribute`); the override keeps using `fusionDisplayAttribute`.
- No change to the data flow for identity-origin Fusion accounts (already correct via `fromIdentity`).
- No change to non-display-attribute use of `identityName` (review form labels, logs, etc.).

## Decisions

### D1: Add `FusionAccount.identityAlias` accessor

- **Choice:** add `public get identityAlias(): string | undefined` on `FusionAccount` (`src/model/fusionAccountAccessors.ts`). It returns `state.identityInfo?.displayName`.
- **Reason:** one source of truth for the authoritative name. Mirrors the new ubiquitous-language spec term directly.
- **Alternatives considered:**
  - Reuse `state.name` and have `addIdentityLayer` overwrite it from the identity — rejected; collapses Fusion account name (internal) with identity alias (authoritative), violating the new spec.
  - Add a separate schema field `fusionAliasAttribute` — rejected; introduces parallel configuration surface.

### D2: Switch `applyDisplayAttributeOverride` to consume `identityAlias`

- **Choice:** in `DefinitionService.applyDisplayAttributeOverrideIfApplicable` (`src/services/definitionService/definitionService.ts:219-225`), replace `const label = fusionAccount.identityName` with `const label = fusionAccount.identityAlias`. Update the JSDoc and the `log.info` message.
- **Reason:** this is the field whose value comes from the authoritative `displayName`. The override is the only consumer that needs the alias; everything else (review form labels, reports, logs) keeps using `identityName`.
- **Alternatives considered:**
  - Lazy resolution at write time (defer the override until `getISCAccount` serializes) — rejected; spreads override logic across the codebase and complicates the existing `canResetDisplay` / `isExistingFusionAccount` short-circuit rules.

### D3: Hydrate correlated identities via the existing `hydrateMissingIdentitiesById`

- **Choice:** after the managed-source aggregation phase, collect distinct `identityId` values from `run.allManagedAccounts` and call the existing `IdentityService.hydrateMissingIdentitiesById(identityIds)` (`src/services/identityService.ts:242`).
- **Reason:** the existing method already does exactly what we need: 50-ID chunks (well under ISC's query-length threshold), `id:("a" OR "b" ...)` query, paginated through `paginateSearchApi`, batched parallel via `promiseAllBatched`, per-batch error isolation, skips already-loaded identities, filters empty IDs.
- **Alternatives considered:**
  - Extend `identityScopeQuery` with an OR-clause per source — rejected; widens the global identity set, can pull tens of thousands of unrelated identities per run.
  - Add a new `fetchCorrelatedIdentitiesForManagedAccounts` method — rejected; the existing method is correct and reusable.

### D4: Pipeline integration order

- **Choice:** in `corePipeline.ts` `fetchPhase` (or whichever phase function runs the managed-source aggregation), after `run.allManagedAccounts` is populated and before any `getISCAccount` serialization:
  1. Collect distinct `identityId` values from the managed accounts.
  2. Call `identities.hydrateMissingIdentitiesById(identityIds)`.
  3. For each `FusionAccount` whose `state.originAccount` is a managed account whose `identityId` is now in `run.allIdentities` and whose `state.identityInfo` is undefined, call `fusionAccount.addIdentityLayer(identity)`. Skip protected identities.

  No explicit re-evaluation call to `applyDisplayAttributeOverride` is required: the existing `FusionService.getISCAccount` already calls `setCoreSchemaAttributes` → `applyDisplayAttributeOverride` immediately before serialization. Once the identity layer is applied, the next `getISCAccount` call writes the alias automatically.

- **Reason:** the existing lazy-evaluation pattern at `getISCAccount` (`src/services/fusionService/fusionService.ts:946`) means we only need to ensure `identityInfo` is populated before serialization, not re-run the override. This minimizes the surface area of the change.
- **Alternatives considered:**
  - Explicit re-evaluation pass after `addIdentityLayer` — rejected; redundant given the lazy evaluation in `getISCAccount`.
  - Lazy resolution at write time without hydration — rejected (see D2).

## Risks / Trade-offs

- [Risk] Hydration cost on large sources. For 50k correlated identities, hydration is `ceil(50000/50) = 1000` batches, each paginated at 250 results. → Mitigation: the existing `BATCH_SIZE = 50` and per-batch error isolation are already tuned. The number of API round-trips is bounded by per-source identity footprint.
- [Risk] Race with new in-run correlations. A managed account that becomes correlated during this run (via the correlation sweep) is not in `run.allManagedAccounts` at hydration time. → Mitigation: the correlation sweep already calls `addIdentityLayer` and the display-attribute override is re-evaluated via the same lazy path.
- [Risk] Order of pipeline phases. If `addIdentityLayer` is called after any `getISCAccount` serialization for the affected accounts, the alias is empty. → Mitigation: pipeline ordering is explicit; the integration test pins the order.
- [Trade-off] Backwards compatibility. Existing tenants that rely on the current (buggy) display-attribute value (the login) will see a behavior change after upgrade. → Accepted: this is a correctness fix, not a config option. Documented in the changelog.

## Migration Plan

N/A — this change does not involve deployment or runtime data migration. The persisted `Account.attributes[fusionDisplayAttribute]` is overwritten by the next operation run after the connector is upgraded; the `Account.name` (Fusion account name) is not changed.

## Open Questions

None.
