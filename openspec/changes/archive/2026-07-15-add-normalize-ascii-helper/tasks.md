## 1. Add diacritic maps and resolver to normalize.ts

- [x] 1.1 Import `transliterate` from the `transliteration` package in `src/services/attributeService/contextHelpers/normalize.ts`
- [x] 1.2 Define `DACH_DIGRAPHS` constant (`ä→ae`, `ö→oe`, `ü→ue`, `ß→ss`)
- [x] 1.3 Define `NORDIC_DIGRAPHS` constant (`ä→ae`, `ö→oe`, `å→aa`, `ø→oe`)
- [x] 1.4 Define `LANGUAGE_RULES` map with keys `de`, `no`, `da`, `sv` pointing to the appropriate rule sets
- [x] 1.5 Implement `resolveLanguage(language: string)` function with hierarchical fallback (exact match, then prefix before `-`)

## 2. Implement normalizeAscii function

- [x] 2.1 Implement `normalizeAscii(input: string, language?: string): string | undefined` — lowercase input, apply language rules or transliteration fallback, return lowercase ASCII output
- [x] 2.2 Handle empty/whitespace-only input (return `undefined`)
- [x] 2.3 Wrap with `withNormalizeFallback('ascii', normalizeAscii)`
- [x] 2.4 Add `ascii` entry to the `Normalize` export object

## 3. Write tests

- [x] 3.1 Add `describe('Normalize.ascii() - diacritic transliteration')` block in `src/services/attributeService/__tests__/formatting.test.ts`
- [x] 3.2 Test German (`de`, `de-DE`, `de-AT`, `de-CH`): umlauts → digraphs, ß → ss, case insensitivity
- [x] 3.3 Test Nordic (`no`, `da`, `sv`): ø → oe, å → aa, ä → ae, ö → oe
- [x] 3.4 Test transliteration fallback (no language, unknown language): French, Spanish names
- [x] 3.5 Test chaining with `$Normalize.name` and `$Normalize.fullName`
- [x] 3.6 Test edge cases: empty string, whitespace-only, pure ASCII input

## 4. Verify

- [x] 4.1 Run `npm test` to confirm all tests pass
- [x] 4.2 Run `npm run lint` to confirm no linting errors
- [x] 4.3 Run `npm run typecheck` to confirm no TypeScript errors

## 5. Documentation

- [x] 5.1 Update `docs/guides/define.md` with `$Normalize.ascii` documentation
- [x] 5.2 Update `README.md` with `$Normalize.ascii` tip
- [x] 5.3 Update `connector-spec.json` sectionHelpMessage (Normal + Unique sections) with `$Normalize.ascii`
