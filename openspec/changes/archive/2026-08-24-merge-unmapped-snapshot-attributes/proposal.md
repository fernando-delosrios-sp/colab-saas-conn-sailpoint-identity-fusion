## Why

Operators expect the global default attribute merge to apply to same-named attributes without adding a mapping row. Runtime Map only evaluates `attributeMaps[].newAttribute`, so unmapped values stay at create-time seed across refresh. Identity-origin is a special-case inject rather than a snapshot the main/origin pointers can name. Unmapped names should refresh using the stored default merge, without walking the full Fusion schema.

## What Changes

**Unmapped snapshot keys use the global default merge**
- From: Map targets are only `attributeMaps[].newAttribute`. Same-named attributes with no mapping row are not merged on refresh. Living spec still says schema-defined attributes are mapping targets; runtime never did that.
- To: On a full `mapAttributes` (no `onlyTargets`), MappingService also merges **unmapped snapshot keys**: names present on live snapshots this invocation that are not mapping targets and not on the control/overlay denylist. Each uses `defaultAttributeMerge` and same-name lookup via the existing merge function. Empty results follow the same clear/identity-fallback path as explicit maps.
- Reason: Refresh unmapped attributes without schema-wide cost.
- Impact: **Behavior change** on refresh for sources with no mapping row for a given name. Existing stored First found / List will start merging those keys. New installs (Main account default) refresh them from main, else origin. Stored `attributeMerge` values are not migrated.

**Identities is a first-class snapshot**
- From: The identity bag is injected into Map only when `originSource` is Identities. Origin for that case is a special branch. `mainAccount` cannot resolve to an identity on managed-origin rows.
- To: When the identity bag is present, register it under the identity id in `sourceAttributeMap` and the snapshot-key index. Origin and main are index lookups. Identity-origin is not a second merge algebra.
- Reason: Main/origin may point at Identities or a managed account on any Fusion row that has the bag.
- Impact: Non-breaking for mapped attributes whose snapshots already behaved this way on identity-origin. Managed-origin rows can resolve Identities if `mainAccount` / `originAccount` holds the identity id.

**Unchanged**
- Explicit mapping rows, per-attribute merge overrides, First found / List / Concatenate / Source name algorithms
- `FusionAccountKind.Identity` still skips Map
- Selective `onlyTargets` does not add implicit keys (record unique registration)
- Define (Velocity), Match scoring, unique generation
- Connector-spec radios and stored `attributeMerge` keys

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mapping-service`: SHALL merge unmapped snapshot keys with the global default merge; SHALL register the Identities snapshot whenever the identity bag is present; SHALL resolve origin and main through the snapshot-key index. SHALL NOT treat the full Fusion schema as mapping targets.
- `ubiquitous-language`: Promote **unmapped snapshot key** and **Identities snapshot**; adjust **Origin snapshot** / **Map** so Identities is a contributing snapshot, not a separate merge path.
- `schema-service`: No requirement change (unmapped schema cardinality already follows default merge). Docs only if mapping guide is considered owned elsewhere — mapping docs follow mapping-service.

## Impact

- `src/services/mappingService/mappingService.ts` — Identities registration; implicit targets after explicit maps; origin via index
- `src/services/mappingService/helpers.ts` — `buildAttributeMappingConfig` already supports no-row default merge; reuse
- Tests: `mappingService/__tests__/mapService.test.ts`, `helpers.test.ts`
- Docs: `docs/use-guides/configuration/mapping-attributes.md`, `docs/configuration/mapping.md`, glossary if generated from UL
- Changelog via changelog-generator at apply close
- No connector-spec radio change; no ISC config migration; no new dependencies
