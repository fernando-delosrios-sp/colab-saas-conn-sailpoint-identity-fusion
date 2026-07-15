## 1. Modify Context Helpers

- [x] 1.1 Export `String` in `src/services/attributeService/contextHelpers/index.ts` so it is available in the Velocity context.

## 2. Update Tests

- [x] 2.1 Add a test in `src/services/attributeService/__tests__/formatting.test.ts` (or the appropriate test file) to verify that `$String(123)` correctly returns `"123"`.
- [x] 2.2 Add a test verifying that `$String.fromCharCode(65)` returns `"A"` (if static methods are available this way).
