## 1. Configuration — Enable manual review toggle

- [x] 1.1 Add `fusionEnableManualReview` to `matchingSettings.ts`, `model/config.ts`, `connector-spec.json` (default true)
- [x] 1.2 Add config read test for default and boolean normalization

## 2. Eligibility helpers

- [x] 2.1 Implement `sourceShouldEnterMatchScoring` and `sourceManualReviewPathAvailable` in `reviewerAvailability.ts`
- [x] 2.2 Unit-test all helper combinations

## 3. FusionService — scoring eligibility validation

- [x] 3.1 Update `validateManagedSourceReviewers` to use `sourceShouldEnterMatchScoring`
- [x] 3.2 Add/adjust fusion aggregation tests for all eligibility scenarios

## 4. Post-score outcome tree

- [x] 4.1 Update `resolveIdentityMatchOutcome`: auto merge → manual review path → non-match
- [x] 4.2 Update `resolveLiveDeferredMatchOutcome` to use `sourceManualReviewPathAvailable`
- [x] 4.3 Add matchOutcomeDispatcher tests for manual review on/off with and without reviewers

## 5. Verification

- [x] 5.1 Run `npm test -- src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts`
- [x] 5.2 Run `npm test -- src/services/matchingService/__tests__/reviewerAvailability.test.ts`
- [x] 5.3 Run `npm test -- src/data/config/settings/__tests__/matchingSettings.test.ts`
- [x] 5.4 Run fusion reviewer validation tests in `fusionService.aggregation.test.ts`

## 6. Documentation and changelog

- [x] 6.1 Update matching-identities, account-list, source-types for dual-toggle model
- [x] 6.2 Update OpenSpec delta specs (fusion-service, match-outcome-dispatch)
- [x] 6.3 Update CHANGELOG with manual review toggle and breaking auto-merge note
