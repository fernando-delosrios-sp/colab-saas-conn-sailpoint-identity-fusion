# Hydrate correlated identity aliases and route the display attribute to them

> **Status:** design — awaiting user review
> **Date:** 2026-07-22
> **Authors:** AI agent + user collaboration

## Context

The new ubiquitous-language spec (`openspec/specs/ubiquitous-language/spec.md`) defines three distinct identity-related names:

- **Identity alias** — the authoritative account name, taken from the top-level `displayName` field of the SDK's `IdentityDocument`. The single value that the Fusion display attribute override SHALL consume.
- **Identity name** — a human-friendly fallback chain (`IdentityDocument.attributes.displayName` → `IdentityDocument.name` → `FusionAccount.name`). Used in reports, review forms, emails, logs.
- **Fusion account name** — the `name` property of a `FusionAccount` (`state.name`). Internal-only: logs, history, conflict tracking.

The current code violates this separation for the managed-account path:

1. `buildIdentityInfo` (`src/model/fusionAccountUtils.ts:29`) populates `IdentityInfo.name` from `IdentityDocument.name` (the login) and `IdentityInfo.displayName` from the authoritative SDK `displayName`. This is correct in isolation.
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

- **Choice:** add `public get identityAlias(): string | undefined` on `FusionAccount` (`src/model/fusionAccountAccessors.ts`). It returns `state.identityInfo?.displayName` — the value `buildIdentityInfo` already populates from the top-level SDK `displayName` (with `attributes.displayName` fallback in `identityDisplayNameFromIdentity`).
- **Reason:** one source of truth for the authoritative name. Mirrors the new ubiquitous-language spec term directly.
- **Alternatives considered:**
  - Reuse `state.name` and have `addIdentityLayer` overwrite it from the identity — rejected because it collapses Fusion account name (internal) with identity alias (authoritative), violating the new spec.
  - Add a separate schema field `fusionAliasAttribute` — rejected; introduces parallel configuration surface for no benefit.

### D2: Switch `applyDisplayAttributeOverride` to consume `identityAlias`

- **Choice:** in `DefinitionService.applyDisplayAttributeOverrideIfApplicable` (`src/services/definitionService/definitionService.ts:219-225`), replace `const label = fusionAccount.identityName` with `const label = fusionAccount.identityAlias`. Update the JSDoc and the `log.info` message.
- **Reason:** this is the field whose value comes from the authoritative `displayName`. The override is the only consumer that needs the alias; everything else (review form labels, reports, logs) keeps using `identityName`.
- **Alternatives considered:**
  - Lazy resolution at write time (defer the override until `getISCAccount` serializes) — rejected; spreads override logic across the codebase and complicates the existing `canResetDisplay` / `isExistingFusionAccount` short-circuit rules.

### D3: Hydrate correlated identities via the existing `hydrateMissingIdentitiesById`

- **Choice:** after the managed-source aggregation phase, collect distinct `identityId` values from `run.allManagedAccounts` and call the existing `IdentityService.hydrateMissingIdentitiesById(identityIds)` (`src/services/identityService.ts:242`).
- **Reason:** the existing method already does exactly what we need:
  - 50-ID chunks (well under ISC's query-length threshold even for 36-char UUIDs).
  - `id:("a" OR "b" ...)` query, paginated through `paginateSearchApi`.
  - Batched parallel execution via `promiseAllBatched`.
  - Per-batch error isolation (failed batch is logged at debug, others continue).
  - Skips identities already in `run.allIdentities`.
  - Filters out empty/blank IDs.
- **Alternatives considered:**
  - Extend `identityScopeQuery` with an OR-clause per source — rejected; widens the global identity set, can pull tens of thousands of unrelated identities per run on large tenants.
  - Add a new `fetchCorrelatedIdentitiesForManagedAccounts` method that re-implements chunking — rejected; the existing method is correct and reusable.
  - Per-source parallel `@accounts(source.id:<id>)` searches — rejected; N+1 searches for N sources.

### D4: Pipeline integration order

- **Choice:** in `corePipeline.ts` `fetchPhase` (or whichever phase function runs the managed-source aggregation), after `run.allManagedAccounts` is populated and before any `getISCAccount` serialization:
  1. Collect distinct `identityId` values from the managed accounts.
  2. Call `identities.hydrateMissingIdentitiesById(identityIds)`.
  3. For each `FusionAccount` whose `state.originAccount` is a managed account whose `identityId` is now in `run.allIdentities` and whose `state.identityInfo` is undefined, call `fusionAccount.addIdentityLayer(identity)`.

  No explicit re-evaluation call to `applyDisplayAttributeOverride` is required: the existing `FusionService.getISCAccount` already calls `setCoreSchemaAttributes` → `applyDisplayAttributeOverride` immediately before serialization. Once the identity layer is applied, the next `getISCAccount` call writes the alias automatically.

- **Reason:** the existing lazy-evaluation pattern at `getISCAccount` (`src/services/fusionService/fusionService.ts:946`) means we only need to ensure `identityInfo` is populated before serialization, not re-run the override. This minimizes the surface area of the change.
- **Alternatives considered:**
  - Explicit re-evaluation pass after `addIdentityLayer` — rejected; redundant given the lazy evaluation in `getISCAccount`.
  - Lazy resolution at write time without hydration — rejected (see D2).

## Data flow

### Correlated managed account path

**Before (buggy)**

```

managed source aggregation
  → FusionAccount built from managed account (state.name = account.name)
  → identityScopeQuery loaded, correlated identity NOT in scope
  → addIdentityLayer never called → identityInfo undefined
  → applyDisplayAttributeOverride writes identityName → undefined
  → display attribute keeps the persisted value (login or account name)

```

**After (corrected)**

```

managed source aggregation
  → FusionAccount built from managed account (state.name = account.name)
  → identityScopeQuery loaded (existing)
  → collect distinct identityId values from run.allManagedAccounts
  → identities.hydrateMissingIdentitiesById(ids) — 50-ID chunks, paginated search
  → for each FusionAccount with a now-loaded correlated identity:
      fusionAccount.addIdentityLayer(identity)        // populates identityInfo
  → getISCAccount (lazy) → setCoreSchemaAttributes → applyDisplayAttributeOverride
      writes identityAlias (= identityInfo.displayName = top-level SDK displayName)
  → display attribute = authoritative identity alias

```

### Identity-origin Fusion account path (unchanged)

`FusionAccount.fromIdentity` already calls `buildFromIdentity` which sets `state.name = identity.name` and `identityInfo = buildIdentityInfo(identity)`. The override now writes the alias (top-level `displayName`) from the same `identityInfo`. No pipeline changes needed for this path.

## Error handling

- `hydrateMissingIdentitiesById` already isolates per-batch failures at debug level. Failed batches leave the affected identities unloaded; the existing pre-fix behavior (display attribute keeps persisted value) applies for those accounts.
- `addIdentityLayer` failures on a single FusionAccount SHALL be logged and skipped; the run continues.
- The lazy `applyDisplayAttributeOverride` call inside `getISCAccount` is unchanged; failures surface as a connector error (existing behavior).
- If a correlated identity becomes protected between aggregation and hydration, `hydrateMissingIdentitiesById` may add it to `run.allIdentities` (the existing method does not filter protected). The pipeline's `addIdentityLayer` call SHALL skip protected identities to match the existing `fetchIdentities` semantics.

## Testing

- **Unit: `FusionAccount.identityAlias`**
  - Returns `state.identityInfo?.displayName` when set.
  - Returns `undefined` when `identityInfo` is undefined.
- **Unit: `applyDisplayAttributeOverride` updated**
  - When `identityAlias` is set, writes that to the display attribute.
  - When `identityAlias` is undefined, the existing `canResetDisplay` / `isExistingFusionAccount` short-circuit rules still apply.
  - Log message contains "identity alias" not "identity name".
- **Unit: pipeline integration in `corePipeline.ts`**
  - Given N managed accounts correlated to M distinct identities, the pipeline calls `hydrateMissingIdentitiesById` once with M IDs.
  - Given the hydration succeeds, the pipeline calls `addIdentityLayer` for each correlated FusionAccount.
  - Protected identities are skipped during `addIdentityLayer`.
- **Unit: `hydrateMissingIdentitiesById` chunking** (already covered, no change)
  - 200 IDs → 4 chunks of 50.
  - Empty input → no search call.
  - All IDs already loaded → no search call.
- **Integration: chain harness scenario**
  - Add a scenario where a managed account is correlated to an identity whose `displayName` differs from `name`. Assert the output Fusion account's display attribute equals `displayName`, not `name`.

## Migration / Compatibility

- Existing tenants that rely on the current (buggy) display-attribute value will see a behavior change after upgrade: the display attribute will start reflecting the authoritative identity alias.
- This is a correctness fix, not a config option. Document in the changelog under "Behavior changes".
- No data migration. The persisted `Account.attributes[fusionDisplayAttribute]` is overwritten by the next operation run; the `Account.name` is not changed (it remains the **Fusion account name** per the spec).

## Risks

- **Hydration cost on large sources.** For a source with 50k correlated identities, hydration is `ceil(50000/50) = 1000` batches, each paginated at 250 results. Real-world: bounded by per-source identity footprint. Mitigation: the per-batch error isolation and the existing `BATCH_SIZE = 50` constant are already tuned.
- **Race with new in-run correlations.** A managed account that becomes correlated during this run (via the correlation sweep) is not in `run.allManagedAccounts` at hydration time. Mitigation: the correlation sweep already calls `addIdentityLayer` and the display-attribute override is re-evaluated as part of the correlation flow.
- **Order of pipeline phases.** If `addIdentityLayer` is called after any `getISCAccount` serialization for the affected accounts, the alias is empty. Mitigation: the pipeline ordering is explicit; the integration test pins the order (hydration + layer-application before any output serialization).

## Open Questions

None.
