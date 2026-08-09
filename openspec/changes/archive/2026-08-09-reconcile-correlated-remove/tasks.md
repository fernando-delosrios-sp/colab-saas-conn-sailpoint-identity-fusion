## 1. Tests — correlate action Remove rejection

- [x] 1.1 Update `src/operations/actions/__tests__/correlateAction.test.ts`: Replace "removes correlated action entitlement on Remove" with expect throw matching `Correlated entitlement cannot be removed: correlated`
- [x] 1.2 Add test case for Remove with `correlate` token — same error pattern with value `correlate`
- [x] 1.3 Add test case confirming Add path still calls `correlateMissingAccountsPerSource` and does not throw

## 2. Implementation — correlateAction handler

- [x] 2.1 In `src/operations/actions/correlateAction.ts`: import `assert`; on `AttributeChangeOp.Remove`, call `assert(false, \`Correlated entitlement cannot be removed: ${change.value}\`)`
- [x] 2.2 Remove obsolete Remove-branch comment about clearing entitlement on update response

## 3. Implementation — account-update pipeline cleanup

- [x] 3.1 Remove `shouldSkipCorrelationStatusRecompute()` from `src/operations/helpers/accountUpdateHelpers.ts`
- [x] 3.2 Remove `shouldRecomputeCorrelationStatus` flag and always call `fusion.getISCAccount(fusionAccount, true)` (default recompute)
- [x] 3.3 Update `src/operations/__tests__/accountUpdate.test.ts`: Replace "skips correlation status recompute when removing correlated action" with expect operation failure and `res.send` not called
- [x] 3.4 Add account-update integration test with real `executeActions` and Remove `correlated` — observable error message

## 4. Living spec updates

- [x] 4.1 Merge `specs/account-update-operation/spec.md` delta into `openspec/specs/account-update-operation/spec.md` (REMOVED skip-recompute requirement; ADDED reject requirement + scenarios)
- [x] 4.2 Merge `specs/fusion-service/spec.md` delta into `openspec/specs/fusion-service/spec.md` (MODIFIED correlated entitlement requirement + Remove rejection scenario)
- [x] 4.3 Merge `specs/ubiquitous-language/spec.md` delta into `openspec/specs/ubiquitous-language/spec.md` (MODIFIED correlated entitlement pair requirement + Remove invalid scenario)

## 5. Validation

- [x] 5.1 Run targeted tests: `npm test -- src/operations/actions/__tests__/correlateAction.test.ts src/operations/__tests__/accountUpdate.test.ts`
- [x] 5.2 Run `openspec validate --all --json` — every item `"valid": true`
- [x] 5.3 Confirm `.scratch/spec-drift-report.md` correlated Remove row can be marked resolved (optional)

## 6. Documentation

- [x] 6.1 Update README / getting-started — N/A (behavior change documented in CHANGELOG); no README update needed
- [x] 6.2 Update API / connector docs — N/A (no MkDocs action-entitlement Remove section to update)
- [x] 6.3 Update inline docs — refresh JSDoc on `correlateAction`; removed stale skip-recompute comment in `getISCAccount`

## 7. Changelog

- [x] 7.1 Create or update changelog entry: account-update Remove for correlated/correlate now fails with observable error
- [x] 7.2 Confirm entry notes breaking change for callers that relied on successful Remove
