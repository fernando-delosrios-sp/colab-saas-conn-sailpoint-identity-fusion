## 1. Dictionary lookup optimization in formProcessor

- [x] 1.1 In `readCorrelatedIdentityId`, replace `Object.values(dict).find(...)` with direct `dict[FusionAttribute.IdentityId]` lookup and `for...in` fallback
- [x] 1.2 In `extractAccountInfoFromFormInput` dictionary branch, replace three `Object.values(...).find(...)` calls with direct key lookups for `account`, `name`, and `source` plus `for...in` fallback per field
- [x] 1.3 In `extractCandidateIdsFromFormInput`, replace `Object.values(formInputs).find(...)` with direct `candidates` key lookup and `for...in` fallback
- [x] 1.4 Preserve flat-path branches and existing value/description predicates unchanged

## 2. Verification

- [x] 2.1 Run type check: `npx tsc --noEmit`
- [x] 2.2 Run form processor tests: `npm test -- src/services/formService/__tests__/formProcessor.test.ts`
- [x] 2.3 Run full test suite: `npm test`
- [x] 2.4 Run lint: `npm run lint`
- [x] 2.5 Grep `formProcessor.ts` — confirm no `Object.values` remains in field extraction helpers

## 3. Documentation

- [x] 3.1 Update JSDoc on affected extractors if needed to note direct-key-then-fallback dictionary resolution (only if it aids maintainers)
