## Why

Status entitlement identifiers are scattered across the codebase as bare string literals (`'baseline'`, `'uncorrelated'`, `'orphan'`, `'reviewer'`, `'activeReviews'`, `'nonMatched'`, `'manual'`, `'auto'`, `'authorized'`, `'candidate'`, `'requested'`). They are produced by `src/data/status.ts` and consumed in `src/model/fusionAccount.ts`, `src/services/fusionService/decisionProcessor.ts`, `src/services/fusionService/fusionService.ts`, `src/operations/accountCreate.ts`, `src/operations/helpers/dryRunHelpers.ts`, and several test files. A typo at any of those call sites silently fails a Set lookup, the entitlement is never added/removed, and the connector emits accounts with the wrong status with no compile-time signal. We want a single typed enum so the compiler catches drift and so any future status only needs to be added in one place.

## What Changes

- Introduce a TypeScript `enum` named `StatusEntitlement` (string-valued) in `src/model/statusEntitlement.ts` with one member for every existing status ID produced by `src/data/status.ts`.
- Update `src/data/status.ts` to derive each `id` from `StatusEntitlement`, so adding a status is a single edit in the enum.
- Replace the string literal arguments at every call site that adds, removes, or tests a status entitlement with the matching `StatusEntitlement` member.
- Keep the `Status` class in `src/model/status.ts` (it represents an entitlement object, not an ID) — the enum is additive and does not delete the class.
- Keep the public `FusionAccount.addStatus` / `removeStatus` / `hasStatus` signatures string-typed so external callers (and persisted payloads) remain compatible. The enum is used internally and is the documented vocabulary for new code.
- Add a unit test that asserts the enum's string values equal the `id` of each entry in `statuses`, locking the contract.

## Capabilities

### New Capabilities
- `status-entitlements`: A typed enum that names every fusion-account status entitlement and is the single source of truth for status IDs produced and consumed by the connector.

### Modified Capabilities
- (None) — no spec-level requirement is changing; this is an internal refactor that hardens the existing contract.

## Impact

- **Affected code:**
  - New: `src/model/statusEntitlement.ts`
  - New: `src/model/__tests__/statusEntitlement.test.ts`
  - Modified: `src/data/status.ts`
  - Modified: `src/model/fusionAccount.ts` (string literals inside the class become enum members)
  - Modified: `src/services/fusionService/decisionProcessor.ts`
  - Modified: `src/services/fusionService/fusionService.ts`
  - Modified: `src/operations/accountCreate.ts`
  - Modified: `src/operations/helpers/dryRunHelpers.ts`
  - Modified (tests only): `src/model/__tests__/fusionAccount.test.ts`, `src/operations/__tests__/accountCreate.test.ts`, `src/services/fusionService/__tests__/fusionService.test.ts`
- **Public API:** No change. `FusionAccount.addStatus` / `removeStatus` / `hasStatus` keep `string` parameters, and the serialized `statuses` attribute on the fusion account is unchanged.
- **Dependencies / build:** None. Pure TypeScript refactor.
- **Verification:** `npm run lint`, `npm test`.
