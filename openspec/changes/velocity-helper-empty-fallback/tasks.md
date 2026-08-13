## 1. Shared fallback utility

- [x] 1.1 Create `src/services/definitionService/contextHelpers/velocityFallback.ts` exporting `withVelocityHelperFallback(helperName, fn)` — returns `''` when inner function returns `undefined` or `null`; catches exceptions and returns `''`

## 2. Refactor existing wrappers

- [x] 2.1 Refactor `normalize.ts` to use `withVelocityHelperFallback` instead of local `withNormalizeFallback` (remove duplicate)
- [x] 2.2 Refactor `dateUtils.ts` to use `withVelocityHelperFallback` instead of local `withDatefnsFallback` (remove duplicate); confirm no behavior change

## 3. Wrap remaining leaking helpers

- [x] 3.1 Wrap `JSONHelper.parse` with `withVelocityHelperFallback('parse', ...)` in `json.ts`
- [x] 3.2 Wrap `AddressParse.getCityState`, `getCityStateCode`, and `parse` with `withVelocityHelperFallback` in `addressParse.ts`

## 4. Tests

- [x] 4.1 Add `$JSON.parse` failure tests in `formatting.test.ts` — invalid JSON, missing variable
- [x] 4.2 Add `$AddressParse` failure tests — missing city, unparseable address
- [x] 4.3 Confirm existing `$Datefns` and `$Normalize` failure tests still pass after refactor
- [x] 4.4 Run `npm test -- src/services/definitionService/__tests__/formatting.test.ts`

## 5. Documentation

- [x] 5.1 Add "Empty output on failure" subsection to `docs/reference/velocity-context.md` documenting the contract for all custom helpers

## 6. Verification

- [x] 6.1 Run `npm run lint` and fix any issues
