## Why

Admins building email addresses, usernames, or identifiers from names need diacritic-aware transliteration. The `transliteration` library strips umlauts to their base ASCII form (`ä→a`, `ö→o`), but German-speaking regions use digraph conventions (`ä→ae`, `ö→oe`). Nordic languages have similar conventions (`ø→oe`, `å→aa`). Currently there is no way to express these language-specific rules in Velocity templates — the post-processing "Normalize special characters?" checkbox is a static on/off toggle with no language awareness. This adds a `$Normalize.ascii` Velocity helper that accepts an optional language code and applies the correct transliteration rules.

## What Changes

- Add `$Normalize.ascii(input, language?)` Velocity helper to the existing `Normalize` context object
- Support 4 languages via 2 rule sets: DACH (`de`) for German digraphs, and Nordic (`no`, `da`, `sv`) for Scandinavian digraphs
- Hierarchical language code resolution: `de-DE` falls back to `de`, unknown codes fall back to the `transliteration` library
- No language parameter → `transliteration` library default (strip diacritics)
- Output is always lowercase ASCII; users chain with `$Normalize.name()` for proper-casing

## Capabilities

### Modified Capabilities
- `attributeService`: The `Normalize` Velocity context object gains a new `ascii` method that transliterates non-ASCII characters to their ASCII equivalents, with language-specific digraph rules for German (`de`) and Nordic (`no`, `da`, `sv`) languages, and a `transliteration` library fallback for all other cases. No existing behavior changes.

## Impact

- `src/services/attributeService/contextHelpers/normalize.ts` — new import (`transliteration`), diacritic maps, resolver function, `normalizeAscii` function, export entry
- `src/services/attributeService/__tests__/formatting.test.ts` — new test block
- No config/schema changes, no API changes, no breaking changes to existing helpers
