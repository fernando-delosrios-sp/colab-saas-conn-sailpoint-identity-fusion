## 1. FusionRun cache fields (TDD)

- [x] 1.1 Add `nameMatcherTokenCache: Map<string, string[]>` and `nameMatcherPhoneticCache: Map<string, [string, string]>` to `src/model/fusionRun.ts` with JSDoc noting run-scoped name-matcher artifacts.
- [x] 1.2 Add unit test or extend `matchService.test.ts`: scoring two identities with the same first name against one managed account invokes `doubleMetaphone` once per distinct token (spy on `double-metaphone` module).

## 2. Name-matcher cache wiring

- [x] 2.1 Add cache-aware helpers in `nameMatching.ts` (e.g. `getCachedTokens`, `getCachedPhoneticCodes`) that read/write the FusionRun maps.
- [x] 2.2 Update `matchNormalized` / `calculatePhoneticSimilarity` to use cached tokens and phonetic codes when a cache bag is provided.
- [x] 2.3 Wire `MatchingService` / `scoreNameMatcherNormalized` to pass `FusionRun` cache maps into the name-matcher path.

## 3. Score parity tests

- [x] 3.1 Confirm all existing `nameMatching.test.ts` cases pass unchanged (no score drift).
- [x] 3.2 Add `matchService.test.ts` case: multi-identity sweep with name-matcher rule produces same scores as before caching (fixture with repeated tokens across identities).

## 4. Verification

- [x] 4.1 Run `npx vitest run src/services/matchingService/__tests__/nameMatching.test.ts src/services/matchingService/__tests__/matchService.test.ts`
- [x] 4.2 Run `npm run lint` (knip must not report unused cache exports)
- [x] 4.3 Run `npx tsc --noEmit`

## 5. Documentation

- [x] 5.1 No user-facing doc changes required (internal perf). JSDoc on new FusionRun fields is sufficient.

## 6. Changelog

- [x] 6.1 Create or update changelog entry via changelog-generator during apply (performance: name-matcher token/phonetic caching).
