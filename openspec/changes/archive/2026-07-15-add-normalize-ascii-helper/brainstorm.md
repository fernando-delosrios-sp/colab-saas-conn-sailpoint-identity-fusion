# Brainstorm: `$Normalize.ascii` — Diacritic Transliteration Helper

## Background

The connector provides `$Normalize.name` and `$Normalize.fullName` Velocity helpers that proper-case names but preserve diacritics (umlauts, accents, etc.). The post-processing "Normalize special characters?" checkbox strips them via the `transliteration` library, but that's a static on/off toggle — no language awareness.

Admins building email addresses, usernames, or IDs from names need diacritic handling with language-appropriate conventions. For German names, the standard convention is digraph transliteration (`ä→ae`, `ö→oe`, `ü→ue`, `ß→ss`) rather than simple stripping (`ä→a`).

## Decision Chain

### Q1: Modify existing helpers or create a new one?

**Options:**
- A: Add optional parameter to `Normalize.name`/`fullName`
- B: Create a new standalone helper

**Decision: B — new helper `$Normalize.ascii()`**

Rationale: `Normalize.name` does proper-casing; `Normalize.ascii` does diacritic handling. Separate concerns. Users chain them: `$Normalize.name($Normalize.ascii($name, "de"))`. No breaking changes to existing helpers.

---

### Q2: How does language selection work?

**Options:**
- A: Source-level config field
- B: Template-level language parameter
- C: Both (config default + template override)

**Decision: B — optional `language` parameter on the helper**

Rationale: Template authors already know the source system's language. A config field requires schema changes for a Velocity-only feature. Follows the existing pattern of `$Normalize.address($addr, "US")` and `$Normalize.phone($phone, "GB")`.

---

### Q3: Which languages need custom rules?

**Options:**
- A: DACH only (`de`)
- B: DACH + Nordic
- C: All languages with established digraph conventions

**Decision: B — `de`, `no`, `da`, `sv`**

Rationale: The `transliteration` library (already a dependency) handles most Latin-script diacritics correctly by stripping. Only German and Nordic languages have universally-established digraph conventions for ASCII fallback. Everything else uses the library's default.

---

### Q4: How to handle unknown languages or missing parameter?

**Options:**
- A: Preserve diacritics (no-op)
- B: Fall back to `transliteration` library (strip diacritics)

**Decision: B — transliteration fallback**

Rationale: If the user passes a language code, they want diacritic handling. Falling back to the library is the safe, predictable default. If they DON'T pass a language, same — they're opting into diacritic stripping, just without language-specific rules.

---

### Q5: Hierarchical or exact language code matching?

**Decision: Hierarchical**

`"de-DE"` → check exact match → if not found, strip `-DE` suffix → check `"de"` → if found, use DACH rules.

This avoids duplicating entries for every locale variant.

---

### Q6: Output casing?

**Options:**
- A: Preserve input case
- B: Always lowercase

**Decision: B — always lowercase**

Rationale: The replacement maps only need lowercase keys. Users chain with `$Normalize.name()` for proper-casing or `.toUpperCase()` for all-caps. Lowercase is the universal intermediate form.

---

## Rule Sets

### DACH (German)
```
ä → ae    ö → oe    ü → ue    ß → ss
```

### Nordic (Norwegian, Danish, Swedish)
```
ä → ae    ö → oe    å → aa    ø → oe
```

## Language → Rule Set Mapping

| Language code | Rule set |
|--------------|----------|
| `de`         | DACH     |
| `no`         | Nordic   |
| `da`         | Nordic   |
| `sv`         | Nordic   |

All variants (e.g., `de-DE`, `de-AT`, `de-CH`, `no-NO`, `da-DK`, `sv-SE`) resolve hierarchically.

## Files Affected

| File | Change |
|------|--------|
| `src/services/attributeService/contextHelpers/normalize.ts` | Add `normalizeAscii` function, maps, resolver, export |
| `src/services/attributeService/__tests__/formatting.test.ts` | Add `Normalize.ascii()` test block |

## Non-Goals

- No changes to `Normalize.name` or `Normalize.fullName`
- No config/schema changes
- No changes to `formatting.normalize()` (checkbox post-processor)
- No changes to `scoringService.normalizeName()`
