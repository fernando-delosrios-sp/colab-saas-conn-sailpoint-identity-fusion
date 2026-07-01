## Why

The report-decision code path in `src/services/reportService.ts` uses the identifier name `accountId` for values that are actually the connector's composite managed-account key (`sourceId::nativeIdentity`). This is documented correctly on `FusionDecision.account.id` in `src/model/form.ts`, but the report service, report types, and report-email types all reuse `accountId` for the composite key, while the URL-resolution logic separately needs the platform ISC account UUID (`Account.id`).

This naming overlap is misleading:
- `FusionReportDecision.accountId` is documented as "Source account ID" but contains the composite key.
- `resolveAccountName(accountId)` and `resolveAccountUrl(accountId, identityId)` receive the composite key, not the ISC account ID.
- `getFusionAccountByNativeIdentity(accountId)` is called with the composite key, which only works because uncorrelated managed Fusion accounts store the composite key in `nativeIdentity`.
- Test doubles and report templates inherit the same ambiguous vocabulary.

Clarifying the vocabulary makes the identifier chain explicit and prevents future regressions when the report needs the actual ISC account UUID.

## What Changes

1. **Rename the report-decision identifier field**
   - In `FusionReportDecision`, rename `accountId` to `managedAccountKey` and update its JSDoc to say "Composite managed account key (sourceId::nativeIdentity)".
   - Update `FusionReportEmailData` and Handlebars templates accordingly (the templates only consume `accountName`, `accountUrl`, and `accountSource`, so `accountId` can simply be removed or renamed without visual change).

2. **Clarify resolver parameter names in `reportService.ts`**
   - `resolveAccountName(accountId)` → `resolveAccountName(managedAccountKey)`.
   - `resolveAccountUrl(accountId, identityId)` → `resolveAccountUrl(managedAccountKey, identityId)`.
   - Internal locals that hold the composite key (`accountId` in `toReportDecision`, `resolveAccountUrl`) become `managedAccountKey`.

3. **Clarify `FusionDecision.account.id` usage in `toReportDecision`**
   - Introduce a local `managedAccountKey = decision.account.id` at the start of the mapping so the rest of the function reads unambiguously.

4. **Update tests**
   - Rename `accountId` variables/expectations in `src/services/__tests__/reportService.test.ts` to `managedAccountKey` where they hold the composite key.
   - Update test doubles for `resolveIscAccountIdForManagedKey` and `getFusionAccountByNativeIdentity` to use the clarified parameter names in their mocks.

5. **Out of scope (handled separately)**
   - Any deeper redesign of `FusionAccountRepository.getFusionAccountByNativeIdentity` or the `fusionAccountMap` key semantics.
   - Changing `FusionDecision.account.id` itself or the way composite keys are constructed.

## Capabilities

### Modified Capabilities
- `fusion-report-rendering`: clarify identifier vocabulary for review-decision rows and report email data.

## Impact

- `src/services/reportService.ts`
- `src/services/fusionService/types.ts` (`FusionReportDecision`)
- `src/services/messagingService/helpers.ts` (`FusionReportEmailData` and templates)
- `src/services/__tests__/reportService.test.ts`
