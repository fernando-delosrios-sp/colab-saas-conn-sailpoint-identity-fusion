## 1. DefinitionService — clear on falsy/error

- [x] 1.1 Add private helper (e.g. `applyNormalDefinitionResultOrClear`) in `definitionService.ts` that applies safe default for core schema attrs or deletes attribute + context key
- [x] 1.2 Update `processNormalDefinition` error branch to call clear-or-safe-default instead of preserve-only safe default
- [x] 1.3 Update `processNormalDefinition` falsy branch (`result.value === undefined || result.value === null`) to call clear-or-safe-default

## 2. Tests

- [x] 2.1 Add test: existing normal attribute cleared when template returns empty output (falsy path)
- [x] 2.2 Add test: existing normal attribute cleared when template evaluation returns error
- [x] 2.3 Add test: core display attribute receives safe default on falsy output (not cleared)
- [x] 2.4 Add test: static definition with existing value still skips evaluation (unchanged behavior)
- [x] 2.5 Add test: non-nullish rendered value still overwrites existing value (regression)
- [x] 2.6 Run `npm test -- src/services/definitionService/__tests__/defineService.test.ts`

## 3. Verification

- [x] 3.1 Run `npm run lint`

## 4. Documentation

- [x] 4.1 Update `docs/reference/velocity-context.md` — empty/falsy definition output clears stored normal attributes; document `$previous` retention pattern
- [x] 4.2 Update `docs/use-guides/configuration/defining-attributes.md` — normal definition behavior table: falsy/error clears value (breaking note)

## 5. Changelog

- [x] 5.1 Add changelog entry describing breaking behavior change for normal attribute falsy/error output (apply invokes changelog-generator if available)
- [x] 5.2 Confirm entry covers user-visible impact and `$previous`/Static migration guidance
