# Brainstorm: Fix case-insensitive duplicate attribute names

## Context

ISC treats account schema attribute names as **case-insensitive**. When managed-source attributes and identity attributes are merged during schema discovery, the same logical attribute can appear with different casing (e.g. `FirstName` from identity + `firstname` from HR source). A discovered schema payload containing both variants is rejected by the platform.

Observed collisions in production:

| Logical name | Colliding variants |
|---|---|
| username | `Username` + `username` |
| firstname | `FirstName` + `firstname` |
| lastname | `LastName` + `lastname` |

`SchemaService.buildDynamicSchema()` already uses a lowercase-key `Map` to merge attribute sources, but the collision handler **overwrites** the first entry's metadata with the later attribute's properties (only preserving the first entry's casing). The user requirement is simpler: **keep the first found, drop all later variants**.

A secondary gap exists in `setFusionAccountSchema()`: internal lookup structures (`_fusionSchemaAttributeNames`, `_fusionSchemaAttributeMap`) are built with case-sensitive keys, so a schema already containing duplicate casings can propagate duplicates into platform account output via `getFusionAttributeSubset()`.

## Decision chain

### Q1: Where must deduplication apply?

**Decision:** Both schema discovery output (`buildDynamicSchema`) and schema ingestion (`setFusionAccountSchema`).

**Reason:** Discovery is the primary fix; ingestion hardens runtime when ISC passes a schema that already contains duplicates (e.g. from a prior bad discover or manual edit).

### Q2: On case-insensitive collision, what wins?

**Decision:** First attribute encountered in the established merge order wins **entirely** (name casing + type + multi + description). Later variants are discarded with no merge.

**Merge order (unchanged):**
1. Fusion static attributes
2. Managed source account schema attributes (sources reversed, sequential)
3. Identity schema attributes
4. Attribute mapping definitions
5. Attribute definition definitions
6. Reverse correlation attributes

**Rejected:** Continue merging metadata from later variants while preserving first casing — violates "keep the first found" and makes behavior harder to reason about.

### Q3: Shared utility or inline fix?

**Decision:** Extract `dedupeSchemaAttributesByName(attributes: SchemaAttribute[]): SchemaAttribute[]` in `src/services/schemaService/helpers.ts` and use it from both call sites.

**Reason:** Single implementation, testable in isolation, prevents drift between discover and ingest paths.

### Q4: Should we log dropped duplicates?

**Decision:** Yes — `log.debug` when a duplicate is skipped, including both casings and source context if available.

**Reason:** Helps operators diagnose why a particular casing was chosen without polluting INFO-level aggregation logs.

## Approaches considered

| Approach | Pros | Cons |
|---|---|---|
| **A. Fix collision handler to skip (recommended)** | Minimal diff, matches existing Map-based design | Requires helper extraction for ingest path |
| B. Post-process filter on final attributes array | Easy to add | Doesn't fix internal maps in `setFusionAccountSchema` |
| C. Normalize all names to lowercase | Eliminates casing ambiguity | Breaking change for existing configs referencing `FirstName` |

## Agreed approach

**A** — skip-on-collision in a shared dedupe helper, applied at schema discovery and schema ingestion. Add unit tests reproducing the three reported collision pairs.

## Design trade-offs

- **[Trade-off]** First source in merge order determines casing, not "preferred" identity vs managed casing. → Accepted: predictable, documented, matches existing test intent.
- **[Risk]** Operators expecting later source metadata to override type/multi. → Mitigation: document that first wins; attribute maps/definitions can still declare authoritative shape if added before managed attrs in order (fusion attrs always first — unchanged).
