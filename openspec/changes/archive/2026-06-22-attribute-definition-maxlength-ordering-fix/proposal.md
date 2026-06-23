## Why

The `maxLength` cap is applied inside `evaluateVelocityTemplate` (i.e. immediately after Velocity rendering), before the post-processing pipeline (`trim`, `case`, `spaces`, `normalize`) runs. When `trim` is enabled, it can remove whitespace from a string that was already truncated to `maxLength`, producing a final value **shorter** than `maxLength`. Additionally, when `$counter` disambiguation is active the counter's character width is not factored into the pre-trim truncation, meaning the truncation point is computed on the pre-counter string and the counter can push the final string beyond `maxLength`.

## What Changes

- **Move `maxLength` truncation to the end of the post-processing pipeline** in both `evaluateTemplate` (normal/unique path) and `applyUniqueValueOutputTransforms` (uniqueness-check path), so trim → case → spaces → normalize run first and `maxLength` governs the final output.
- **Remove `maxLength` from the `evaluateVelocityTemplate` signature** — truncation will no longer happen inside the Velocity renderer; the caller is responsible.
- **Counter-aware truncation in `evaluateVelocityTemplate` / `truncateResultToMaxLength`**: since `maxLength` is no longer applied there, the counter-aware truncation logic (`truncateResultToMaxLength`) moves to wherever `maxLength` is enforced post-processing, or the caller must pass the effective available length after reserving space for the counter. Specifically: when a counter is present in context, the available character budget for the non-counter portion must be `maxLength − len($counter)` so the final assembled string does not exceed `maxLength`.
- Update existing unit tests in `formatting.test.ts` and `attributeService.test.ts` to reflect the new ordering and add regression cases for trim-then-truncate and counter-aware truncation.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `attribute-definition-documentation`: the documented behaviour of `maxLength` must be updated to state that it is applied **after** all other output transforms (trim, case, spaces, normalize), and that when `$counter` is in use the counter length is reserved from the available budget before truncation.

## Impact

- **`src/services/attributeService/formatting.ts`**: remove `maxLength` parameter from `evaluateVelocityTemplate`; keep `truncateResultToMaxLength` but move its call site.
- **`src/services/attributeService/attributeService.ts`**: apply `maxLength` truncation (including counter-aware logic) at the end of `evaluateTemplate` and `applyUniqueValueOutputTransforms`.
- **`src/services/attributeService/__tests__/formatting.test.ts`**: update/add tests.
- **`src/services/attributeService/__tests__/attributeService.test.ts`**: update/add regression tests.
- **`openspec/specs/attribute-definition-documentation/spec.md`**: add requirement capturing the corrected ordering and counter-reservation rule.
- No API or schema changes; no breaking changes for users who do not rely on the (incorrect) too-short behaviour.
