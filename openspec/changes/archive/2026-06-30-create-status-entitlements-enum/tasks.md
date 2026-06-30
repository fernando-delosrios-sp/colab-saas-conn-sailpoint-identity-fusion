## 1. Introduce the enum and contract test

- [x] 1.1 Create `src/model/statusEntitlement.ts` exporting `enum StatusEntitlement` with the eleven string-valued members listed in `design.md` Decision 4.
- [x] 1.2 Create `src/model/__tests__/statusEntitlement.test.ts` with three assertions: every enum value is an `id` in `statuses`, every `id` in `statuses` equals an enum value, and the enum has exactly eleven members.
- [x] 1.3 Run `npx jest src/model/__tests__/statusEntitlement.test.ts` and confirm the new test passes.

## 2. Derive `data/status.ts` from the enum

- [x] 2.1 In `src/data/status.ts`, import `StatusEntitlement` from `../model/statusEntitlement`.
- [x] 2.2 Replace each `id: 'literal'` with `id: StatusEntitlement.<Member>`. Names and descriptions stay as strings.
- [x] 2.3 Re-run the contract test from 1.2 to confirm the data file still matches the enum.

## 3. Migrate production call sites to the enum

- [x] 3.1 In `src/model/fusionAccount.ts`, replace every `addStatus('...')`, `removeStatus('...')`, `hasStatus('...')`, `_statuses.add('...')`, `_statuses.delete('...')`, and `set.has('...')` argument that names a status with the matching `StatusEntitlement.*` member. Leave the public method signatures (`string`) unchanged.
- [x] 3.2 In `src/services/fusionService/decisionProcessor.ts`, replace the four `'candidate'` literals in `account.addStatus` / `account.removeStatus` / `identity.addStatus` / `identity.removeStatus` with `StatusEntitlement.Candidate`.
- [x] 3.3 In `src/services/fusionService/fusionService.ts`, replace `fusionAccount.addStatus('candidate')` with `StatusEntitlement.Candidate`.
- [x] 3.4 In `src/operations/accountCreate.ts`, replace `fusionIdentity.addStatus('requested', '...')` with `StatusEntitlement.Requested`.
- [x] 3.5 In `src/operations/helpers/dryRunHelpers.ts`, replace the `'baseline'` and `'nonMatched'` literals used in the categorization branch with `StatusEntitlement.Baseline` and `StatusEntitlement.NonMatched`.

## 4. Migrate test call sites to the enum (production-path tests only)

- [x] 4.1 In `src/model/__tests__/fusionAccount.test.ts`, replace `addStatus(...)` / `hasStatus(...)` / `removeStatus(...)` invocations that exercise production code with the enum. Keep any `statuses: ['baseline']`-style fixtures that simulate persisted data on string literals.
- [x] 4.2 In `src/operations/__tests__/accountCreate.test.ts`, update the `toHaveBeenCalledWith('requested', ...)` assertion to `StatusEntitlement.Requested`.
- [x] 4.3 In `src/services/fusionService/__tests__/fusionService.test.ts`, replace the two `addStatus('candidate', ...)` calls with `StatusEntitlement.Candidate`. Leave any `statuses: ['baseline']` / `['activeReviews']` fixtures that represent persisted data on string literals.

## 5. Verify

- [x] 5.1 Run `npm run lint` and fix any lint findings.
- [x] 5.2 Run `npm test` and confirm all suites pass, including the new `statusEntitlement.test.ts`.
- [x] 5.3 `git grep -nE "'(baseline|uncorrelated|orphan|reviewer|activeReviews|nonMatched|manual|auto|authorized|candidate|requested)'" src/` and review the remaining hits — only test fixtures simulating persisted data and `src/data/status.ts` (which is now enum-derived) should remain.
