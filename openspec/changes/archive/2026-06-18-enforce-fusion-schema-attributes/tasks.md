## 1. Implement code changes

- [x] 1.1 Add UUID fallback for `fusionIdentityAttribute` in `src/services/attributeService/attributeService.ts` (`fusionAttributeSafeDefault`).
- [x] 1.2 Explicitly set `fusionIdentityAttribute = identity.id` in `src/services/fusionService/fusionService.ts` (`processIdentity`).
- [x] 1.3 Change display-attribute identity-name condition from `fromIdentity` to `isIdentity` in `processNormalDefinition` and `processUniqueDefinition`.
- [x] 1.4 Refine `hostingIdentityName()` to prefer identity name over account name for correlated (non-identity-origin) accounts.

## 2. Update tests

- [x] 2.1 Update `attributeService.test.ts` to assert UUID fallback and correlated-account display-name behavior.
- [x] 2.2 Update `fusionService.test.ts` to assert identity attribute is set from `identity.id` in `processIdentity`.
- [x] 2.3 Verify `accountCreate.test.ts` still passes (no changes needed).

## 3. Verify

- [x] 3.1 Run targeted tests (`attributeService.test.ts`, `fusionService.test.ts`) and fix failures.
- [x] 3.2 Run `tsc --noEmit` and `eslint` on changed files.
- [x] 3.3 Validate the OpenSpec change with `openspec validate enforce-fusion-schema-attributes`.
- [x] 3.4 Run `scenarioRunner.smokeMatrix.test.ts` integration test.
