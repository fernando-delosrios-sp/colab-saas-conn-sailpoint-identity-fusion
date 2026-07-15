## 1. Schema Updates

- [x] 1.1 Add `static` boolean toggle to the Normal Attributes section in `connector-spec.json`.
- [x] 1.2 Update the `helpKey` for the new `static` toggle and ensure it explains the mutual exclusivity with `refresh`.
- [x] 1.3 Add `static?: boolean` to `NormalAttributeDefinition` interface in `src/model/connector-spec-types.ts` (if applicable) or `src/services/attributeService/attributeService.ts`.

## 2. Core Evaluation Logic

- [x] 2.1 Update `processNormalDefinition` in `src/services/attributeService/attributeService.ts` to check `definition.static`.
- [x] 2.2 In `processNormalDefinition`, skip evaluation if `static` is true, the attribute has a valid value, and `needsReset` is false, overriding `needsRefresh`.

## 3. Testing and Validation

- [x] 3.1 Write a unit test verifying that a static attribute evaluates when no value is present.
- [x] 3.2 Write a unit test verifying that a static attribute is NOT re-evaluated on subsequent aggregations even if source data changes (`needsRefresh` is true).
- [x] 3.3 Write a unit test verifying that a static attribute IS re-evaluated if `needsReset` is explicitly true.
