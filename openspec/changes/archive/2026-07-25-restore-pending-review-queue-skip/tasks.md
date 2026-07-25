## 1. FusionRun inventory extension

- [x] 1.1 Add optional `identityId` to `ManagedAccountInfo` and populate it in `toManagedAccountInfo`
- [x] 1.2 Update `fusionRun.test.ts`: inventory retains `identityId` after `setManagedAccount`

## 2. Fetch-phase pending-review queue depletion

- [x] 2.1 Normalize account ids from form instances in `extractAccountIdFromInstance` / `extractAccountInfoOverride` using `normalizeCompositeManagedAccountKey`
- [x] 2.2 Change `extractAccountInfoOverride`: when `shouldRemoveAccountFromMap && run.hasManagedAccount(normalizedId)`, call `claimAccount` if key still in work queue (use queue `identityId`, else inventory `identityId`)
- [x] 2.3 Add `formService.test.ts` cases: pending review claims account; normalized id claim; inventory-only path after prior claim in same batch
- [x] 2.4 Add integration-style test: after `processFetchedFormData` with pending instances, account absent from `managedAccountsById` but present in inventory

## 3. Form definition reuse hardening

- [x] 3.1 In `getOrCreateFormDefinition`, catch duplicate-name create conflict, retry `getFormDefinitionByName`, reuse if found
- [x] 3.2 Add unit test simulating create 409 followed by successful name lookup

## 4. Partial-match same-run claim

- [x] 4.1 Pass source `Account` into `handlePartialMatch` (or resolve key from fusion account) and call `run.claimAccount` when `formDefinitionReady` is true
- [x] 4.2 Add `matchOutcomeDispatcher.test.ts`: successful partial match removes account from work queue; failed form creation does not claim

## 5. Verification

- [x] 5.1 Run targeted tests: `npx vitest run src/services/formService/__tests__/formService.test.ts src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts src/model/__tests__/fusionRun.test.ts`
- [x] 5.2 Run `npm run lint`
