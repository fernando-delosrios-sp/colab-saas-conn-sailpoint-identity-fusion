# Implementer Report: Plan 004 — Constants module + attribute-bag keys

**Status:** DONE

## What was implemented

- **Task 1 — Audit:** Inventoried raw attribute keys in `FusionAccount` and related files. Decided not to commit a separate audit note.
- **Task 2 — Rename internal `attributeBag.accounts`:**
  - Renamed `FusionAttributeBag.accounts` → `sourceAccountContexts` in `src/model/fusionAccountTypes.ts`.
  - Updated constructor and `setManagedAccount` in `src/model/fusionAccount.ts`.
  - Updated `getOrderedAccountsForContext` in `src/services/attributeService/attributeService.ts`.
  - Updated all mock `attributeBag` objects in `src/services/attributeService/__tests__/attributeService.test.ts`.
- **Task 3 — Centralize constants:**
  - Added `FusionAttribute.IdentityId = 'identityId'` to `src/data/schema.ts` and matching `identityId` schema attribute.
  - Created `src/model/fusionAction.ts` with `Correlated = 'correlated'` and `ReviewerPrefix = 'reviewer:'`.
  - Replaced raw `'identityId'`, `'correlated'`, and `'reviewer:'` strings in `src/model/fusionAccount.ts` with the new constants.
  - Extended `src/data/__tests__/schema.test.ts` to assert 11 attributes and the runtime value of `IdentityId`.
- **Review follow-up:**
  - Cleaned up commit history so the refactor commit contains only source changes.
  - Migrated remaining raw `'correlated'`, `'reviewer:'`, and `'identityId'` strings in `src/operations/actions/`, `src/data/action.ts`, and `src/services/formService/` to `FusionAction`/`FusionAttribute`.

## What was tested

- `npx vitest run src/model/__tests__/fusionAccount.test.ts src/services/attributeService/__tests__/attributeService.test.ts` — PASS (86 tests)
- `npx vitest run src/data/__tests__/schema.test.ts src/model/__tests__/fusionAccount.test.ts src/services/attributeService/__tests__/attributeService.test.ts` — PASS (90 tests)
- `npx vitest run src/model/__tests__/fusionAccount.test.ts -t "toISCAccount serialization"` — PASS (6 tests)
- `npx vitest run src/model/__tests__/fusionAccount.test.ts -t "Missing-accounts restoration"` — PASS (2 tests)
- `npm run lint` — PASS
- `npx tsc --noEmit` — PASS
- `npm run test` — PASS (79 test files, 960 tests passed, 2 skipped)

## TDD evidence

- Round-trip characterization tests from Plan 002 (`toISCAccount serialization`, `Missing-accounts restoration`) continue to pass, confirming persisted attribute names (`accounts`, `missing-accounts`, `identityId`, etc.) remain unchanged at runtime.
- Contract test for `FusionAttribute` was updated to cover the new `IdentityId` member and its runtime value.

## Files changed

- `src/model/fusionAccountTypes.ts`
- `src/model/fusionAccount.ts`
- `src/services/attributeService/attributeService.ts`
- `src/services/attributeService/__tests__/attributeService.test.ts`
- `src/data/schema.ts`
- `src/data/__tests__/schema.test.ts`
- `src/model/fusionAction.ts` (new)
- `src/operations/accountUpdate.ts`
- `src/operations/actions/correlateAction.ts`
- `src/operations/actions/reviewerAction.ts`
- `src/data/action.ts`
- `src/services/formService/formBuilder.ts`
- `src/services/formService/formProcessor.ts`

## Self-review findings

- Internal `attributeBag.accounts` renamed to `sourceAccountContexts` ✅
- `FusionAttribute` extended with `IdentityId` ✅
- `FusionAction` constants introduced for `correlated` and `reviewer:` ✅
- Raw strings replaced with constants across `fusionAccount.ts`, action handlers, and form service ✅
- Persisted attribute names unchanged for round-trip compatibility ✅
- `npm run lint` passes ✅
- `npx tsc --noEmit` passes ✅
- `npm run test` passes with round-trip tests preserved ✅

## Issues or concerns

None. History was rewritten to remove scaffolding files from the source refactor commit, and remaining raw strings were migrated to the new constants.

## Commits

- `refactor: rename attributeBag.accounts to sourceAccountContexts and centralize keys`
- `docs: add Plan 004 implementation report`
- `refactor: migrate remaining action and identityId raw strings to constants`
