## 1. formatting.ts — Remove maxLength from Velocity renderer

- [x] 1.1 Remove the `maxLength` parameter from `evaluateVelocityTemplate` signature and its internal truncation block (`if (maxLength && result.length > maxLength)`) in `src/services/attributeService/formatting.ts`
- [x] 1.2 Export `truncateResultToMaxLength` from `formatting.ts` (change from `const` to exported function) so callers can apply counter-aware truncation after post-processing
- [x] 1.3 Update all call sites of `evaluateVelocityTemplate` that currently pass `maxLength` to remove the argument (only `attributeService.ts` line ~864)

## 2. attributeService.ts — Apply maxLength last in evaluateTemplate

- [x] 2.1 In `evaluateTemplate`, after the `trim → case → spaces → normalize` block, add maxLength truncation as the final step: call `truncateResultToMaxLength` if `definition.maxLength` is set and the value exceeds it (passing the current context so counter-aware logic works)
- [x] 2.2 In `applyUniqueValueOutputTransforms`, move the `maxLength` block (currently lines 1263–1265) to after the `normalize` step (currently last at line 1269), matching the `evaluateTemplate` order exactly

## 3. Tests — formatting.test.ts

- [x] 3.1 Update existing `maxLength` truncation tests in `formatting.test.ts` to not pass `maxLength` to `evaluateVelocityTemplate` (since the parameter is removed)
- [x] 3.2 Add regression test: expression renders with leading/trailing whitespace, `trim: true`, `maxLength` set — verify the final value is exactly `maxLength` chars (not shorter)
- [x] 3.3 Add test: counter active, counter length + prefix exceeds `maxLength` — verify prefix is trimmed and assembled value is exactly `maxLength` chars

## 4. Tests — attributeService.test.ts

- [x] 4.1 Add regression test for Normal attribute definition: `trim: true` + `maxLength` — final stored value is `maxLength` chars, not shorter
- [x] 4.2 Add regression test for Unique attribute definition: `trim: true` + `maxLength` — final stored value is `maxLength` chars, not shorter
- [x] 4.3 Add test asserting that `applyUniqueValueOutputTransforms` and `evaluateTemplate` produce the same result for the same definition + raw input (pipeline consistency)

## 5. Spec validation

- [x] 5.1 Run `openspec validate attribute-definition-maxlength-ordering-fix --type change --strict` and confirm no validation errors
