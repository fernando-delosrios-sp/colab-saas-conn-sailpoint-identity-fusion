## 1. Model layer changes

- [x] 1.1 Keep `displayName` in `IdentityInfo` and define alias/display chains.
- [x] 1.2 Update `buildIdentityInfo` to populate `id`, `name`, and `displayName` with the resolved chains.
- [x] 1.3 Update `FusionAccount.name` getter to return `_name` only.
- [x] 1.4 Update `isIdentity` to require non-empty `_identityInfo.id`.
- [x] 1.5 Update factory methods to set `_name` from the correct source.
- [x] 1.6 Remove or repurpose `identityLabelFromIdentity` and `labelsFromAccount` helpers.

## 2. Service layer changes

- [x] 2.1 Simplify `getFusionReportAccountLabel` to use display/alias/source-title/id fallbacks.
- [x] 2.2 Remove hard-coded `fusionDisplayAttribute = identity.name` in `processIdentity` if covered by override.
- [x] 2.3 Strengthen immutability guards in `attributeService` for `fusionDisplayAttribute` and `fusionIdentityAttribute`.
- [x] 2.4 Change `fusionAttributeSafeDefault` for identity attribute to UUID fallback.
- [x] 2.5 Exclude identity decisions from display-attribute override.
- [x] 2.6 Update form builder to use `identityName` instead of removed/aliased `identityDisplayName` paths.

## 3. Test updates

- [x] 3.1 Update `fusionAccount.test.ts` expectations for `buildIdentityInfo` and getters.
- [x] 3.2 Update `fusionService.test.ts` identity hydration tests.
- [x] 3.3 Update `fusionReportHelpers.test.ts` label fallback tests.
- [x] 3.4 Update `attributeService.test.ts` immutability and reset tests.
- [x] 3.5 Update form builder tests if needed.

## 4. Verification

- [x] 4.1 Run the full test suite.
- [x] 4.2 Fix any remaining failures.

## 5. Fusion Review Decisions section follow-ups

The Fusion Review Decisions section in the report uses a separate code path
(`toReportDecision` in `src/services/reportService.ts` + form extraction in
`src/services/formService/formProcessor.ts`) and exhibited the same
"label/ID" contamination. The follow-up fixes ensure the reviewer-decision
card renders the human-readable account name and links the "Created new
identity" entry to the ISC account page.

- [x] 5.1 Stop contaminating `FusionDecision.account.name` with the composite
      managed key in `extractAccountInfoFromFormInput`
      (`src/services/formService/formProcessor.ts`).
- [x] 5.2 Stop contaminating the account-info override name with the composite
      managed key in `extractAccountInfoOverride`
      (`src/services/formService/formService.ts`).
- [x] 5.3 Resolve `accountName` for decision rows from `managedAccountsAllById`
      when `decision.account.name` is missing or equals the composite key
      (`src/services/reportService.ts:toReportDecision` +
      `buildFusionReviewDecisions`).
- [x] 5.4 Stop using the raw ISC identity ID as a display-name fallback in
      `resolveIdentityContext`
      (`src/services/reportService.ts`).
- [x] 5.5 Stop using the raw `decision.identityId` as a display-name fallback
      for `selectedIdentityName` (`src/services/reportService.ts:toReportDecision`).
- [x] 5.6 Add a second `accountUrl` resolution pass using the managed
      account's ISC `id` when `resolveIscAccountIdForManagedKey` returns
      undefined, so the "Created new identity" card links to the ISC
      human-accounts page (`src/services/reportService.ts:resolveAccountUrl`).
- [x] 5.7 Add unit tests for the new `accountName` resolution chain, the
      composite-key-only fallback, and the removal of the `identityId`
      name fallback (`src/services/__tests__/reportService.test.ts`).
- [x] 5.8 Re-run the full test suite, lint, and typecheck.
- [x] 5.9 In `resolveAccountUrl`, prefer the ISC `account.id` over the
      composite managed key. The primary path is
      `resolveIscAccountIdForManagedKey`; the second pass reads
      `managedAccount.id` directly when the key is present and distinct
      from the composite key. The composite key remains the final
      fallback so the link is never lost for accounts without a separate
      ISC id (`src/services/reportService.ts:resolveAccountUrl`).
- [x] 5.10 Wrap the full `{{accountName}} [{{accountSource}}]` string in the
      `accountUrl` link in the Fusion Review Decisions card, so the
      "Created new identity" entry links the source-name tag to the ISC
      human-accounts page as well
      (`src/services/messagingService/helpers.ts`).
- [x] 5.11 Update the regression test to assert the new behavior: when the
      managed account has no separate ISC id, `accountUrl` still resolves
      to a `/human-accounts/` URL using the composite key as a fallback
      (`src/services/__tests__/reportService.test.ts`).
- [x] 5.12 Re-run the full test suite, lint, and typecheck.
