# Brainstorm: Drop legacy raw managed account IDs

## Context

Identity Fusion NG persists managed account references in standard schema attributes:

- **`accounts`** — correlated managed account keys
- **`missing-accounts`** — uncorrelated managed account keys awaiting correlation
- **`originAccount`** — identity ID or managed account key set at account creation

Documentation in `docs/reference/standard-account-schema.md` states that **legacy raw IDs** (plain ISC account UUIDs without the `sourceId::nativeIdentity` composite form) are supported for backwards compatibility on all three attributes.

Production code partially tolerates legacy values:

| Location | Current behavior |
|---|---|
| `FusionLayers.addManagedAccountLayer` | Silently drops non-composite keys when normalizing `accounts` / `missing-accounts` / `previousAccountIds` sets |
| `rebuildFusionAccount.parseManagedAccountKeys` | Logs warning and skips non-composite keys during account-read rebuild |
| `FusionAccount.applyOriginMetadata` | Preserves raw `originAccount` when normalization fails (`normalized ?? trimmed`) |
| `candidateRegistry`, `correlationManager`, `formInstanceAnalyzer`, `formService` | Fall back to raw value via `normalizeCompositeManagedAccountKey(x) ?? x` |

The canonical contract (ubiquitous language + most factory paths) already requires composite keys. Legacy tolerance creates drift: docs advertise support, some code paths accept raw IDs, and operators cannot tell whether persisted rows are valid.

**Out of scope:** Other "legacy" features (Velocity `_id` fallbacks — already removed; config `reset` key; observability log patterns; Identity Fusion v1 migration guides).

## Decision chain

### Q1: What exactly is being dropped?

**Decision:** Remove backwards compatibility for **non-composite managed account identifiers** in `accounts`, `missing-accounts`, and `originAccount` (when the origin is a managed source).

**Still valid for `originAccount`:** Plain identity IDs when `originSource` is `Identities` — that is the canonical form, not legacy.

### Q2: What should happen when persisted data contains a raw ID?

**Decision:** **Reject and drop** non-composite managed account references during load/normalization; emit a **diagnostic warning** (not a silent skip labeled "legacy compat"). Do **not** fail the entire aggregation or account-read for a single bad reference — partial data loss is preferable to blocking production runs while tenants migrate.

**Rationale:** Matches current normalization behavior in `FusionLayers` but removes fallbacks that re-introduce raw IDs into lookups (`?? rawKey` patterns).

**Rejected alternative — fail fast:** Would break tenants with any stale row until manual cleanup; higher operational risk for a deprecation path.

**Rejected alternative — auto-migrate:** Would require ISC account ID → composite key resolution at read time, re-introducing the compatibility layer we are removing.

### Q3: How should account-read rebuild behave?

**Decision:** Replace the "legacy non-composite skipped with warning" scenario with **composite-only managed account key parsing**. Non-composite values are **ignored for fetch** with a warning that states the value is **not a valid managed account key** (remove "legacy" / "backwards compatibility" framing).

### Q4: Documentation and schema descriptions?

**Decision:** Update `docs/reference/standard-account-schema.md` and `fusionAccountSchemaAttributes` descriptions in `src/data/schema.ts` to require composite keys only. Remove all "legacy raw IDs supported" prose.

## Agreed approach

1. Remove `normalizeCompositeManagedAccountKey(x) ?? x` fallbacks in production code; use composite key or undefined.
2. Tighten `originAccount` loading: identity IDs allowed when origin is Identities; managed-source origins require composite keys.
3. Update specs (`account-read-operation`, `fusion-service`, `schema-service`) and tests.
4. Update user-facing docs.

## Trade-offs

- **[Breaking change]** Tenants with persisted raw IDs lose those references until data is migrated → **Mitigation:** document migration (re-aggregate or patch attributes to composite keys).
- **[Operational]** Warnings may increase briefly during migration → **Acceptable:** signals data hygiene work needed.

## Open questions

None blocking — user request is explicit: drop the backwards-compatibility feature.
