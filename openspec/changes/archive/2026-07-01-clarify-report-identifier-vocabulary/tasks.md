## 1. Update report model types

- [x] 1.1 In `src/services/fusionService/types.ts`, rename `FusionReportDecision.accountId` to `managedAccountKey`.
- [x] 1.2 Update the JSDoc for `managedAccountKey` to: "Composite managed account key (sourceId::nativeIdentity) for the reviewed account."
- [x] 1.3 In `src/services/messagingService/helpers.ts`, update `FusionReportEmailData.fusionReviewDecisions[*].accountId` to `managedAccountKey`.

## 2. Update `reportService.ts` vocabulary

- [x] 2.1 In `toReportDecision`, add `const managedAccountKey = decision.account.id` near the top.
- [x] 2.2 Use `managedAccountKey` when assigning `managedAccountKey` in the returned object (currently `accountId`).
- [x] 2.3 Pass `managedAccountKey` to `resolveAccountName` and `resolveAccountUrl`.
- [x] 2.4 Rename `resolveAccountName` parameter from `accountId` to `managedAccountKey`.
- [x] 2.5 Rename `resolveAccountUrl` first parameter from `accountId` to `managedAccountKey`.
- [x] 2.6 Rename internal `accountId` locals inside `resolveAccountUrl` to `managedAccountKey` where they hold the composite key.
- [x] 2.7 Keep local `reportAccountId` for the value returned by `resolveIscAccountIdForManagedKey` (this is the ISC account UUID and is already correctly named).

## 3. Update tests

- [x] 3.1 In `src/services/__tests__/reportService.test.ts`, rename test variables/expectations from `accountId` to `managedAccountKey` where they refer to the composite key.
- [x] 3.2 Update mock implementations of `resolveIscAccountIdForManagedKey` and `getFusionAccountByNativeIdentity` to use the new parameter names in their function signatures.
- [x] 3.3 Update any assertions that read `decisions[0].accountId` to read `decisions[0].managedAccountKey`.

## 4. Verification

- [x] 4.1 Run `npm run lint` (or equivalent) and fix errors.
- [x] 4.2 Run `npm run typecheck` (or equivalent) and fix errors.
- [x] 4.3 Run the report service tests: `npx jest src/services/__tests__/reportService.test.ts`.
- [x] 4.4 Run the full test suite.
- [ ] 4.5 Archive the change when complete.
