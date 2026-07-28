## 1. MD5 context helper implementation

- [x] 1.1 Create `src/services/definitionService/contextHelpers/md5.ts` exporting `MD5(text)` as a function using `crypto.createHash('md5')`, returning lowercase hex; return `''` for null, undefined, non-string, or whitespace-only input
- [x] 1.2 Export `MD5` function from `src/services/definitionService/contextHelpers/index.ts` in the `contextHelpers` object

## 2. Tests

- [x] 2.1 Add `$MD5(...)` tests in `src/services/definitionService/__tests__/formatting.test.ts` via `evaluateVelocityTemplate` — cover known digest, empty input, and non-string input
- [x] 2.2 Run `npm test -- src/services/definitionService/__tests__/formatting.test.ts` and confirm all tests pass

## 3. Documentation

- [x] 3.1 Add `$MD5(input)` section to `docs/guides/define.md` under Apache Velocity context helpers, including a usage example and note that MD5 is for deterministic identifiers, not security

## 4. Verification

- [x] 4.1 Run `npm run lint` and fix any issues
