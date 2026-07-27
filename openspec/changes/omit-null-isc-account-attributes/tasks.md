## 1. Schema subset implementation

- [x] 1.1 Add failing unit tests for `getFusionAttributeSubset` — omit null/undefined keys, retain populated values, retain empty arrays, do not mutate input bag
- [x] 1.2 Update `getFusionAttributeSubset` in `schemaService.ts` to skip assignment when input or cast value is nullish
- [x] 1.3 Run `npx vitest run src/services/schemaService/__tests__/schemaService.test.ts` and confirm pass

## 2. Downstream test alignment

- [x] 2.1 Audit fusionService and ReplayAdapter tests for assertions expecting explicit null attribute keys; update if any fail after change
- [x] 2.2 Run targeted tests: `npx vitest run src/services/fusionService/__tests__/fusionService.test.ts src/operations/__tests__/chain/harness/ReplayAdapter.ts`

## 3. Documentation

- [x] 3.1 Add JSDoc on `getFusionAttributeSubset` noting nullish keys are omitted from platform output (internal bags unchanged)

## 4. Verification

- [x] 4.1 Run `npm run lint`
- [x] 4.2 Run full test suite or `npm test` if time permits
