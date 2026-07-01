## 1. Introduce the enum and contract test

- [x] 1.1 Add `export enum FusionAttribute` to `src/data/schema.ts` with the ten string-valued members listed in `design.md` Decision 4 (`History`, `Statuses`, `Actions`, `Accounts`, `MissingAccounts`, `Reviews`, `Sources`, `MainAccount`, `OriginSource`, `OriginAccount`).
- [x] 1.2 Create `src/data/__tests__/schema.test.ts` with three assertions: every enum value is a `name` in `fusionAccountSchemaAttributes`, the enum has exactly ten members, and the enum does not contain the values `"name"` or `"id"`.
- [x] 1.3 Run `npx jest src/data/__tests__/schema.test.ts` and confirm the new test passes.

## 2. Migrate `src/model/fusionAccount.ts` to the enum

- [x] 2.1 Import `FusionAttribute` from `../data/schema`.
- [x] 2.2 In `initializeBasicProperties` (L201-204), replace `'missing-accounts'`, `'reviews'`, `'statuses'`, `'actions'` arguments to `attributeToSet` with the matching `FusionAttribute.*` members.
- [x] 2.3 In `fromFusionAccount` (L220, L239, L251, L269, L271), replace `'statuses'`, `'originSource'`, `'originAccount'`, `'accounts'`, `'history'` literals with the matching `FusionAttribute.*` members.
- [x] 2.4 In `fromManagedAccount` (L317), replace `'sources'` argument to `getAccountAttribute` with `FusionAttribute.Sources`.
- [x] 2.5 In `syncCollectionAttributesToBag` (L960-969), replace each `bag['...']` key with `bag[FusionAttribute.<Member>]`. Leave `bag['identityId']` as a raw string (`identityId` is not a default schema attribute).
- [x] 2.6 Run `npx jest src/model/__tests__/fusionAccount.test.ts` and confirm all tests pass.

## 3. Migrate `src/model/fusionAccountUtils.ts` to the enum

- [x] 3.1 Import `FusionAttribute` from `../data/schema`.
- [x] 3.2 In `resolveCompositeManagedKeyFromFusionRecord` (L84, L85, L87), replace `'originAccount'`, `'mainAccount'`, and `attributes['missing-accounts']` with `FusionAttribute.OriginAccount`, `FusionAttribute.MainAccount`, and `attributes[FusionAttribute.MissingAccounts]`. Also convert `attributes.accounts` (dot access) to `attributes[FusionAttribute.Accounts]` for consistency.
- [x] 3.3 Run any model utility tests and confirm all pass.

## 4. Migrate `src/operations/helpers/rebuildFusionAccount.ts` to the enum

- [x] 4.1 Import `FusionAttribute` from `../../data/schema`.
- [x] 4.2 In `collectManagedAccountKeys` (L30, L31), replace `'accounts'` and `'missing-accounts'` arguments to `attributeToSet` with `FusionAttribute.Accounts` and `FusionAttribute.MissingAccounts`.
- [x] 4.3 Run `npx jest src/operations/helpers/__tests__/rebuildFusionAccount.test.ts` and confirm all tests pass.

## 5. Migrate dry-run helpers to the enum

- [x] 5.1 In `src/operations/helpers/buildDryRunPayload.ts`, import `FusionAttribute` from `../../data/schema` and replace `attributes.accounts`, `attributes['missing-accounts']`, and `attributes.statuses` (L253, L254, L255) with `attributes[FusionAttribute.Accounts]`, `attributes[FusionAttribute.MissingAccounts]`, and `attributes[FusionAttribute.Statuses]`.
- [x] 5.2 In `src/operations/helpers/dryRunHelpers.ts`, import `FusionAttribute` from `../../data/schema` and replace the `'originAccount'`, `'statuses'`, and `'accounts'` literals with the matching `FusionAttribute.*` members (L538, L539, L616, L693, L695).
- [x] 5.3 Run `npx jest src/operations/helpers/__tests__/dryRunHelpers.test.ts` and `npx jest src/operations/__tests__/dryRun.test.ts` and confirm all tests pass.

## 6. Migrate `src/services/attributeService/attributeService.ts` to the enum and drop the three module consts

- [x] 6.1 Import `FusionAttribute` from `../../data/schema`.
- [x] 6.2 Remove the three module-level `const` aliases (`MAIN_ACCOUNT_ATTRIBUTE`, `ORIGIN_ACCOUNT_ATTRIBUTE`, `ORIGIN_SOURCE_ATTRIBUTE`).
- [x] 6.3 Replace every literal use of `'mainAccount'`, `'originAccount'`, `'originSource'`, and `'history'` in production code with the matching `FusionAttribute.*` member. Confirm the test file in `src/services/attributeService/__tests__/attributeService.test.ts` continues to use string literals for test fixtures simulating persisted data.
- [x] 6.4 Run `npx jest src/services/attributeService/__tests__/attributeService.test.ts` and confirm all tests pass.

## 7. Migrate `src/services/schemaService/schemaService.ts` to the enum

- [x] 7.1 Import `FusionAttribute` from `../../data/schema`.
- [x] 7.2 In `buildDynamicSchema` (L376), replace `groupAttribute: 'actions'` with `groupAttribute: FusionAttribute.Actions`. Leave `displayAttribute: 'name'` and `identityAttribute: 'id'` as raw strings (SDK structural keys, not default attributes).
- [x] 7.3 Run any schema service tests and confirm all pass.

## 8. Migrate `src/operations/accountCreate.ts` and `src/operations/accountUpdate.ts` to the enum

- [x] 8.1 In `src/operations/accountCreate.ts`, import `FusionAttribute` from `../data/schema` and replace `attribute: 'actions'` (L78) with `attribute: FusionAttribute.Actions`.
- [x] 8.2 In `src/operations/accountUpdate.ts`, import `FusionAttribute` from `../data/schema` and replace `change.attribute === 'actions'` (L68) with `change.attribute === FusionAttribute.Actions`.
- [x] 8.3 Run `npx jest src/operations/__tests__/accountCreate.test.ts` and `npx jest src/operations/__tests__/accountUpdate.test.ts` and confirm all tests pass.

## 9. Verify

- [x] 9.1 Run `npm run lint` and fix any lint findings.
- [x] 9.2 Run `npm test` and confirm all suites pass, including the new `src/data/__tests__/schema.test.ts`.
- [x] 9.3 `git grep -nE "'(history|statuses|actions|accounts|missing-accounts|reviews|sources|mainAccount|originSource|originAccount)'" src/` and review the remaining hits — only test fixtures simulating persisted data, JSDoc comments, ISC identity search field names, the schema array declaration, and TypeScript type annotations (e.g. `Pick<…, 'sources' | …>`) remain. None are production code references to default schema attributes.
