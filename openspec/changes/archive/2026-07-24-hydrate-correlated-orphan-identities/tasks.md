## 1. Narrow hydration helper

- [x] 1.1 Update `hydrateCorrelatedManagedAccountIdentities` (or rename to `hydrateCorrelatedOrphanIdentities`) to collect `identityId` only from managed accounts where `uncorrelated === false`
- [x] 1.2 Remove the apply loop over `fusionAccounts` from the helper; helper returns `{ hydrated: number }` only
- [x] 1.3 Update JSDoc to state purpose: enable identity alias on new Fusion accounts from correlated orphans

## 2. Relocate pipeline call site

- [x] 2.1 Remove hydration call and log lines from `fetchPhase` in `accountListPhases.ts`
- [x] 2.2 Add hydration call after `initializeManagedAccountProcessing()` and before `processCorrelatedManagedAccounts()` in `processPhase`
- [x] 2.3 Add `log.stepStart('orphan-identity-hydration')` / `log.stepEnd` around the hydration call
- [x] 2.4 Update barrel export in `accountList.ts` if helper is renamed

## 3. Apply identity layer at orphan creation site

- [x] 3.1 In `MatchOutcomeDispatcher`, correlated orphan branch (`uncorrelated === false`, not linked): after `assembleManagedAccount`, call `addIdentityLayer` when identity is in cache and not protected
- [x] 3.2 Ensure layer is applied before outcome dispatch serializes the account via `getISCAccount`

## 4. Tests

- [x] 4.1 Update `hydrateCorrelatedManagedAccountIdentities.test.ts`: scope filter excludes uncorrelated and linked scenarios; no apply assertions on helper
- [x] 4.2 Add test: linked correlated account `identityId` not collected when not on queue (or filter excludes `uncorrelated !== false`)
- [x] 4.3 Add dispatcher test: correlated orphan gets `addIdentityLayer` when identity hydrated
- [x] 4.4 Add integration-style test: orphan-derived Fusion account exposes `identityAlias` on display attribute after full path
- [x] 4.5 Run targeted tests: `npx vitest run src/operations/helpers/__tests__/hydrateCorrelatedManagedAccountIdentities.test.ts src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts`

## 5. Verification

- [x] 5.1 Run `npm run lint`
- [x] 5.2 Run `npm test` or confirm no regressions in affected suites
