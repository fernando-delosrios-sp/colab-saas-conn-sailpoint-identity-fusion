## 1. Platform attribute subset

- [x] 1.1 In `src/services/schemaService/__tests__/schemaService.test.ts`, replace `retains empty multi-valued arrays` and add failing tests named for these scenarios: Unset attribute is omitted from subset; Populated attribute is retained; Blank string is omitted; Whitespace-only string is omitted; Surrounding whitespace on a non-blank string is preserved; Empty multi-valued array is omitted; Multi-valued array of only blank strings is omitted; Mixed multi-valued array drops blank elements; Boolean false is retained; Numeric zero is retained; Blank string on a numeric attribute is emitted as zero; Blank string on a boolean attribute is emitted as false; Blank identity attribute is retained; Whitespace-only display attribute is retained; Null identity attribute is omitted; Blank required attribute other than id or name is omitted; String zero is retained; Internal bag unchanged
- [x] 1.2 In `SchemaService.getFusionAttributeSubset`, after the existing cast, omit a blank string or an empty array. Remove blank string elements from a multi-valued value first and omit the attribute when none remain. Always assign `id` and `name` when the emitted value is a blank string. Keep `false`, `0`, and non-blank strings unchanged, including surrounding whitespace. Do not change `castAttributeValue` or `castScalar`. Do not add a configuration setting. Do not mutate the input bag (copy arrays when filtering). Do not change `FusionAccount.toISCAccount`
- [x] 1.3 Run `npx vitest run src/services/schemaService/__tests__/schemaService.test.ts` and confirm pass. Leave `fusionService.aggregation.test.ts` as-is: it mocks `getFusionAttributeSubset` as a pass-through, so its `reviews: []` assertion is not this filter

## 2. Verification

- [x] 2.1 Confirm canonical test command: `npm test`
- [x] 2.2 All delta spec scenarios covered by named automated tests (coverage evidence for `/opsx:verify`)
- [x] 2.3 Run `npm run lint` and confirm no new warnings from this change

## 3. Documentation

- [x] 3.1 No README or getting-started change: payload omission belongs on the schema reference, not the getting-started router
- [x] 3.2 In `docs/reference/standard-account-schema.md`, state that the account sent to ISC omits blank strings and empty arrays, and that `id` and `name` are still sent when blank. Keep the attribute table as the schema, not a claim that every attribute is populated on every account
- [x] 3.3 Update the JSDoc on `getFusionAttributeSubset` so it describes omission of blank strings and empty arrays, the `id` and `name` exemption, and that the input bag is not mutated

## 4. Changelog

- [x] 4.1 Create or update changelog entry for this change via changelog-generator
- [x] 4.2 Confirm the entry says ISC account output omits blank strings and empty arrays, and that `id` and `name` are still sent when blank
