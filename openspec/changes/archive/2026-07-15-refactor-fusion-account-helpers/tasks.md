## 1. Refactor `rebuildFusionAccount.ts`

- [x] 1.1 Extract `collectManagedAccountKeys(fusionAccount, identity, isManagedSource)` helper that reads account references via `attributeToSet` and builds keys via `buildManagedAccountKey`.
- [x] 1.2 Extract `parseManagedAccountKeys(accountIds, log)` helper that uses `parseManagedAccountKey`, logs legacy-key warnings, and returns valid parsed keys.
- [x] 1.3 Extract `cascadeAggregateSources(sourceIds, sources, log)` helper for the optional cascade-aggregation block.
- [x] 1.4 Rewrite `rebuildFusionAccount` as an orchestration function calling the helpers above.
- [x] 1.5 Run `rebuildFusionAccount` tests and update mocks/assertions as needed.

## 2. Fix direct attribute mutation in `accountUpdate.ts`

- [x] 2.1 Replace the reverse-correlation snapshot restore block with calls to `fusionAccount.setReverseCorrelationAttribute` and `fusionAccount.clearReverseCorrelationAttribute`.
- [x] 2.2 Run `accountUpdate` tests and update mocks/assertions as needed.

## 3. Fix `FusionAccount` initialization bug

- [x] 3.1 Change `initializeBasicProperties` to load `_missingAccountIds` from the `missing-accounts` attribute instead of `accounts`.
- [x] 3.2 Add/update model tests verifying that persisted `missing-accounts` are restored into the missing set.

## 4. Validation

- [x] 4.1 Run the full test suite for affected areas (`src/operations`, `src/model`, `src/services/fusionService`).
- [x] 4.2 Run lint/typecheck to ensure no TypeScript errors.
- [x] 4.3 Review diff for unintended behavioral changes beyond the intended bug fix.
