## 1. Trigram substring optimization

- [x] 1.1 In `src/services/matchingService/trigramIndex.ts`, replace character concatenation in `extractTrigrams` with `padded.substring(i, i + 3)`
- [x] 1.2 In `queryAttributeIndex`, replace character concatenation with `padded.substring(i, i + 3)` for trigram bucket lookup
- [x] 1.3 Preserve existing padding template, loop bounds, and function signatures (no API changes)

## 2. Verification

- [x] 2.1 Run type check: `npx tsc --noEmit`
- [x] 2.2 Run trigram index tests: `npm test -- src/services/matchingService/__tests__/trigramIndex.test.ts`
- [x] 2.3 Run full test suite: `npm test`
- [x] 2.4 Run lint: `npm run lint`

## 3. Documentation

- [x] 3.1 Confirm existing JSDoc on `extractTrigrams` and `queryAttributeIndex` still accurately describes behavior (update only if substring detail aids maintainers)
