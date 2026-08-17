## Why

Identity Fusion NG skips Match scoring when neither automatic merge nor manual review (with reviewers) is configured. Manual review was implicit — no toggle — which made the Match outcome tree hard to reason about. When **Enable automatic merge** is on without reviewers, high-confidence merges should still run, but borderline scores should non-match unless manual review is enabled with reviewers.

## What Changes

**Configuration**
- Add **`fusionEnableManualReview`** toggle (default **true**) to Matching Settings alongside **Enable automatic merge** and manual review score.

**Scoring eligibility (pre-score)**
- Score when: `fusionEnableAutoMerge` **OR** (`fusionEnableManualReview` **AND** reviewers configured).
- Otherwise: add source to `sourcesWithoutReviewers`, skip scoring → non-match.

**Post-score outcomes**
1. Automatic merge when enabled and score ≥ `fusionAutoMergeScore`
2. Manual review when `fusionEnableManualReview` and reviewers and score ≥ `fusionManualReviewScore` (below auto threshold)
3. Non-match otherwise

## Capabilities

### Modified Capabilities

- `matching-service/match-outcome-dispatch`: Scoring gate and ordered post-score outcome tree using both toggles.
- `fusion-service`: `validateManagedSourceReviewers` uses combined eligibility formula.

## Impact

- `connector-spec.json`, `matchingSettings.ts`, `model/config.ts`
- `reviewerAvailability.ts` — eligibility helpers
- `fusionService.ts`, `identityMatchResolution.ts`, `deferredMatchResolution.ts`
- Tests, docs, CHANGELOG
