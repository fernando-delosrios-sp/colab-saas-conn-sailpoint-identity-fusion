## Context

The Identity Fusion connector builds a unified account schema by merging attributes from fusion defaults, managed sources, identity profiles, attribute mappings, attribute definitions, and reverse-correlation settings. ISC treats attribute names as case-insensitive, so `FirstName` and `firstname` are the same attribute.

`buildDynamicSchema()` already keys a merge map by `attribute.name.toLowerCase()`, but its collision branch spreads the **later** attribute over the existing entry (preserving only the first entry's casing). The reported production failure shows both casings in the discover payload — the fix must enforce strict first-wins semantics and apply the same rule when ingesting schemas at runtime.

## Goals / Non-Goals

**Goals:**
- Ensure schema discovery returns at most one attribute per case-insensitive name
- Keep the **first** attribute in the established merge order (name + metadata)
- Apply the same dedup when setting the fusion account schema from ISC input
- Add unit tests reproducing `Username`/`username`, `FirstName`/`firstname`, `LastName`/`lastname` collisions
- Log skipped duplicates at debug level

**Non-Goals:**
- Normalizing all attribute names to a single casing convention (breaking change)
- Changing attribute **value** bag merging in Map/Define (schema names only)
- Migrating or rewriting schemas already stored in ISC (operators re-run discover)

## Decisions

### D1: Skip-on-collision instead of merge-on-collision

- **Choice:** When a lowercase key already exists in the dedupe map, return early without updating the entry.
- **Reason:** Matches the user requirement "keep the first found" and eliminates ambiguous metadata blending.
- **Considered alternatives:**
  - *Merge metadata, preserve first casing (current)* — rejected; not "keep first found"
  - *Last wins* — rejected; contradicts requirement and existing test intent

### D2: Shared dedupe helper

- **Choice:** Add `dedupeSchemaAttributesByName(attributes, log?)` in `src/services/schemaService/helpers.ts`.
- **Reason:** Single implementation for discovery and ingestion; independently unit-testable.
- **Considered alternatives:**
  - *Inline in buildDynamicSchema only* — rejected; leaves `setFusionAccountSchema` gap

### D3: Dedupe at schema ingestion

- **Choice:** Run dedupe on `accountSchema.attributes` inside `setFusionAccountSchema` before building `_fusionSchemaAttributeNames` and `_fusionSchemaAttributeMap`.
- **Reason:** Case-sensitive `Set`/`Map` on raw attribute names allows both `Username` and `username` in internal name lists, which can produce duplicate keys in `getFusionAttributeSubset` output.
- **Considered alternatives:**
  - *Only fix discover* — rejected; incomplete hardening

### D4: Preserve existing merge order

- **Choice:** Keep the current source ordering in `buildDynamicSchema` (fusion → managed sources → identity → mappings → definitions → reverse correlation).
- **Reason:** Minimizes behavior change beyond collision handling; existing test expects managed-source casing to win over identity when managed is added first in order.

## Risks / Trade-offs

- [Risk] Operator expects identity attribute type/multi to override managed source → Mitigation: Document first-wins order; attribute definitions added later in order can still declare shape if configured
- [Risk] Debug log volume on schemas with many collisions → Mitigation: DEBUG level only; one line per skipped attribute
- [Trade-off] Casing follows merge order, not a "preferred" source → Accepted: predictable and already partially tested

## Migration Plan

1. Ship connector with dedupe fix
2. Affected tenants re-run **Account Schema Discovery** (or allow ISC to refresh schema on next aggregation with updated connector)
3. No database migration; no config changes required
4. Rollback: revert connector version; previously stored schemas unaffected

## Open Questions

_(none — requirements are clear from production failure report)_
