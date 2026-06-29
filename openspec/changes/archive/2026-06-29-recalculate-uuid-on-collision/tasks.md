## 1. Implementation

- [x] 1.1 Update `src/services/attributeService/attributeService.ts` to ensure `$UUID` is recalculated on every collision retry attempt without incorrectly applying a counter.
- [x] 1.2 Add unit tests in `src/services/attributeService/__tests__/attributeService.test.ts` to verify that collisions for `$UUID`-containing expressions result in a new UUID being generated rather than appending a counter.

## 2. Documentation

- [x] 2.1 Update `docs/guides/define.md` to document the new collision resolution behavior for `$UUID` (generating a new UUID instead of auto-appending `$counter`).
