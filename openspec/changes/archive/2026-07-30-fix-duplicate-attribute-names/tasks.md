## 1. Dedupe helper

- [x] 1.1 Add `dedupeSchemaAttributesByName(attributes, log?)` to `src/services/schemaService/helpers.ts` — lowercase-key map, first wins, skip blanks
- [x] 1.2 Add unit tests in `src/services/schemaService/__tests__/helpers.test.ts` covering first-wins, blank-name skip, and multi-collision input

## 2. Schema discovery fix

- [x] 2.1 Refactor `buildDynamicSchema` `addAttribute` to skip on collision (or delegate to helper for final array)
- [x] 2.2 Add debug log when a duplicate casing is skipped (include kept vs dropped names)
- [x] 2.3 Extend `schemaService.test.ts` with regression tests for `Username`/`username`, `FirstName`/`firstname`, `LastName`/`lastname` collisions across managed + identity sources
- [x] 2.4 Update existing "preserve original casing on collisions" test to assert first-wins metadata (not merged metadata from later source)

## 3. Schema ingestion fix

- [x] 3.1 Dedupe `accountSchema.attributes` in `setFusionAccountSchema` before building `_fusionSchemaAttributeNames` and `_fusionSchemaAttributeMap`
- [x] 3.2 Add test: input schema with `LastName` + `lastname` yields single entry in `listSchemaAttributeNames()` and single key in `getFusionAttributeSubset` output

## 4. Verification

- [x] 4.1 Run `npm test -- src/services/schemaService`
- [x] 4.2 Run `npm run lint` (eslint clean on touched files; repo-wide lint fails pre-existing `.venv` noise)

## 5. Documentation

- [x] 5.1 Update `docs/operations/account-discover-schema.md` — note case-insensitive dedup keeps first encountered variant
- [x] 5.2 N/A — troubleshooting docs do not document schema discovery API rejection for name collisions
- [x] 5.3 N/A — helper JSDoc added on `dedupeSchemaAttributesByName`; no other public API change

## 6. Changelog

- [x] 6.1 Add CHANGELOG entry: fix case-insensitive duplicate attribute names in schema discovery
- [x] 6.2 Confirm entry covers schema discovery API rejection fix from proposal
