## Context

The connector exposes Velocity template helpers via a `Normalize` context object (`$Normalize.name`, `$Normalize.phone`, etc.). These are registered in `src/services/attributeService/contextHelpers/normalize.ts`. The `transliteration` library (v2.6.1, already a dependency) converts Unicode to ASCII but always strips diacritics (`ä→a`) rather than producing digraphs (`ä→ae`). The post-processing "Normalize special characters?" checkbox in attribute definitions uses this library but has no language awareness.

German-speaking regions (DACH) and Nordic countries follow established digraph conventions for ASCII fallback. This design adds a new `$Normalize.ascii` helper that applies the correct rules based on an optional language code.

## Goals / Non-Goals

**Goals:**
- Provide a `$Normalize.ascii(input, language?)` Velocity helper
- Support German (`de`) with DACH digraph rules (`ä→ae`, `ö→oe`, `ü→ue`, `ß→ss`)
- Support Norwegian/Danish/Swedish (`no`, `da`, `sv`) with Nordic digraph rules (`ä→ae`, `ö→oe`, `å→aa`, `ø→oe`)
- Hierarchical language code resolution (`de-DE` → `de`)
- Fall back to `transliteration` library for unknown/missing language
- Always output lowercase ASCII for predictable chaining with `$Normalize.name()`

**Non-Goals:**
- No changes to `Normalize.name` or `Normalize.fullName`
- No config/schema/changes to connector-spec.json
- No changes to `formatting.normalize()` (checkbox post-processor)
- No changes to `scoringService.normalizeName()`
- No new npm dependencies

## Decisions

### D1: New helper, not parameter on existing helpers

- **Choice**: New `$Normalize.ascii()` standalone helper
- **Rationale**: `Normalize.name` does proper-casing; `Normalize.ascii` does diacritic handling. Separate concerns. Users chain them: `$Normalize.name($Normalize.ascii($name, "de"))`. No breaking changes.
- **Alternatives considered**: Adding an optional parameter to `Normalize.name`/`fullName`. Rejected because it mixes concerns and makes the signature harder to understand.

### D2: Template-level language parameter, not config field

- **Choice**: Optional `language` parameter on the Velocity helper
- **Rationale**: Follows existing pattern (`$Normalize.address($addr, "US")`, `$Normalize.phone($phone, "GB")`). Template authors already know the source system's language. Avoids schema changes for a Velocity-only feature.
- **Alternatives considered**: Source-level config field. Rejected because it adds schema complexity and is less flexible (same config might feed templates in different languages).

### D3: Lowercase output

- **Choice**: Always return lowercase ASCII
- **Rationale**: The replacement maps only need lowercase keys (`ä→ae` not `Ä→Ae`). Lowercase is the universal intermediate form — users chain with `$Normalize.name()` for proper-casing or `.toUpperCase()` for all-caps.
- **Alternatives considered**: Preserve input case. Rejected because it would require both upper and lowercase replacement maps, doubling the rule set size for no practical benefit.

### D4: Hierarchical language code resolution

- **Choice**: `de-DE` → check exact match → strip suffix → check `de` → found
- **Rationale**: Avoids duplicating entries for every locale variant. A single `de` entry covers `de-DE`, `de-AT`, `de-CH`.
- **Alternatives considered**: Exact match only. Rejected because it would require maintaining duplicate or alias entries.

### D5: Two rule sets (DACH + Nordic), not per-language

- **Choice**: Shared rule sets referenced by multiple language codes
- **Rationale**: German-speaking countries share the same conventions; Nordic countries share the same conventions. A `LANGUAGE_RULES` map where multiple keys point to the same rule set object avoids duplication.
- **Alternatives considered**: Per-language inline maps. Rejected for maintainability — changing a digraph would require edits in multiple places.

### D6: Transliteration fallback for unknown languages

- **Choice**: Use `transliteration` library when language is unknown or not provided
- **Rationale**: If the user passes a language code, they're explicitly opting into diacritic handling. Falling back to the established library is the safe, predictable default. The library already handles hundreds of Unicode characters correctly.
- **Alternatives considered**: Preserve diacritics (no-op). Rejected because it would create confusing asymmetry — `$Normalize.ascii($name, "de")` strips but `$Normalize.ascii($name)` doesn't.

## Risks / Trade-offs

- **[Risk] `transliteration` library behavior may change in future versions** → Mitigation: pinned at `^2.6.1` in package.json; the library is stable and widely used.
- **[Risk] Nordic `ä→ae` and `ö→oe` share DACH digraphs, but `å→aa` and `ø→oe` are Nordic-specific** → Mitigation: separate `NORDIC_DIGRAPHS` map ensures no cross-contamination. Swedish uses `ä→ae` (same as German) which is correct.
- **[Trade-off] `ß→ss` handled by both our DACH rule and the `transliteration` library** → Acceptable: redundant but explicit. If we ever change the fallback, DACH still works correctly.
- **[Trade-off] Lowercase output vs. case-preserving** → Acceptable: chaining with `$Normalize.name()` restores proper-case. The intermediate form being lowercase is predictable.

## Migration Plan

N/A — this is a purely additive change. No existing behavior changes. No deployment or config migration needed.

## Open Questions

None.
