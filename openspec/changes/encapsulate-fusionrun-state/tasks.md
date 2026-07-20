## 1. Add encapsulated methods to FusionRun

- [ ] 1.1 Add fusion account registry methods: `registerFusionAccount`, `removeFusionAccount`, `getFusionIdentity`, `getFusionAccountByManagedKey`, `hasFusionIdentity`, `findFusionAccountForIdentity`, `registerFusionAccount` (with LogService conflict tracking), plus iterators: `totalFusionAccountCount`, `allFusionAccounts`, `allFusionIdentities`, `fusionIdentitiesExcluding`
- [ ] 1.2 Add identity cache methods: `addIdentity`, `removeIdentity`, `clearIdentities`, `getIdentity`, `hasIdentity`
- [ ] 1.3 Add scoring state methods: `markAutoAssigned`, `isAutoAssigned`, `resetScoringState`
- [ ] 1.4 Add linked account index methods: `initLinkedAccountIndex`, `clearLinkedAccountIndex`
- [ ] 1.5 Add decision and review URL methods: `addDecision`, `clearDecisions`, `addReviewUrlForReviewer`, `addReviewUrlForCandidate`, `addPendingCandidateId`, `getReviewerUrls`, `getCandidateUrls`
- [ ] 1.6 Add non-matched keys method: `clearNonMatchedKeys`
- [ ] 1.7 Absorb reviewer state from FusionAccountRepository: `reviewersBySourceId`, `sourcesWithoutReviewers` fields
- [ ] 1.8 Update `snapshot()` and `restore()` to use private fields where applicable

## 2. Migrate callers to use FusionRun methods

- [ ] 2.1 Migrate `identityProcessor.ts`: replace `fusionIdentityMap.has/set/delete`, `fusionAccountMap.get/delete`, and `findFusionAccountByIdentityManagedAccounts` with `hasFusionIdentity`, `findFusionAccountForIdentity`, `removeFusionAccount`, `registerFusionAccount`
- [ ] 2.2 Migrate `fusionService.ts`: replace duplicate `getFusionIdentity`/`getFusionAccountByManagedKey` wrappers with direct FusionRun method calls; replace `autoAssignedIdentityIds.clear()`, `matchScoringMs = 0` with `resetScoringState`; replace `linkedAccountKeyIndex` assignments with `initLinkedAccountIndex`/`clearLinkedAccountIndex`
- [ ] 2.3 Migrate `identityService.ts`: replace `identityMap.clear/set/delete` with `clearIdentities`, `addIdentity`, `removeIdentity`, `getIdentity`
- [ ] 2.4 Migrate `formService.ts`: replace `fusionIdentityDecisions = []`/`.push()` with `clearDecisions`/`addDecision`; replace `pendingReviewUrls*` get/set patterns with `addReviewUrlForReviewer`/`addReviewUrlForCandidate`; replace `pendingCandidateIdentityIds.add()` with `addPendingCandidateId`
- [ ] 2.5 Migrate `managedAccountOutcomeHandler.ts`: replace `autoAssignedIdentityIds.add()` with `markAutoAssigned`
- [ ] 2.6 Migrate `decisionProcessor.ts`: replace `fusionIdentityMap.get()` with `getFusionIdentity`
- [ ] 2.7 Migrate `fusionAccountRepository.ts` usage in callers: replace `repo.getFusionIdentity`/`repo.setFusionAccount`/etc. with `run.*` equivalents

## 3. Make fields private and delete repository

- [ ] 3.1 Make these fields `private` on FusionRun: `fusionAccountMap`, `fusionIdentityMap`, `identityMap`, `autoAssignedIdentityIds`, `linkedAccountKeyIndex`, `fusionIdentityDecisions`, `pendingCandidateIdentityIds`, `pendingReviewUrlsByReviewerId`, `pendingReviewUrlsByCandidateId`, `currentRunNonMatchedKeysBySource`
- [ ] 3.2 Delete `src/services/fusionService/fusionAccountRepository.ts`
- [ ] 3.3 Remove FusionAccountRepository from service registry and all imports

## 4. Update tests

- [ ] 4.1 Update `model/__tests__/fusionRun.test.ts`: add tests for all new methods
- [ ] 4.2 Update `services/fusionService/__tests__/` tests: replace raw map access with method calls
- [ ] 4.3 Update `services/formService/__tests__/` tests: replace raw array/Map mutations with method calls
- [ ] 4.4 Update `services/identityService/__tests__/` and any other affected test files
- [ ] 4.5 Run full test suite: `npm test`

## 5. Verify and document

- [ ] 5.1 Run `npm run lint` and fix any issues
- [ ] 5.2 Run `npm run build` to verify compilation
- [ ] 5.3 Update `docs/concepts/` if any concept docs reference FusionAccountRepository
- [ ] 5.4 Run `npm test` one final time to confirm all tests pass
