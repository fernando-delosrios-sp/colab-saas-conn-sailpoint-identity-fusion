# fusion-service Delta Spec

## ADDED Requirements

### Requirement: Managed source Match scoring eligibility uses automatic merge and manual review toggles

During `initializeManagedAccountProcessing`, `FusionService.validateManagedSourceReviewers` SHALL evaluate each managed source for Match scoring eligibility. A source SHALL enter Match scoring when **`fusionEnableAutoMerge`** is true **or** when **`fusionEnableManualReview`** is true and the source has at least one reviewer in `run.reviewersBySourceId`. When neither condition holds, the source SHALL be added to `run.sourcesWithoutReviewers` and an ERROR log SHALL be emitted once per source stating accounts will be treated as non-matched. When automatic merge is enabled and the source has zero reviewers, the source SHALL NOT be added to `run.sourcesWithoutReviewers`, and a WARN log SHALL state manual review is unavailable and borderline matches will register as non-match.

#### Scenario: Manual review enabled without reviewers and automatic merge disabled skips scoring
- **GIVEN** `fusionEnableAutoMerge` is false
- **AND** `fusionEnableManualReview` is true
- **AND** managed source `"Source A"` has zero reviewers in `run.reviewersBySourceId`
- **WHEN** `validateManagedSourceReviewers` runs during managed account initialization
- **THEN** `"Source A"` SHALL be present in `run.sourcesWithoutReviewers`
- **AND** an ERROR log SHALL mention that Match scoring is not configured

#### Scenario: Automatic merge enabled without reviewers allows scoring
- **GIVEN** `fusionEnableAutoMerge` is true
- **AND** managed source `"Source A"` has zero reviewers in `run.reviewersBySourceId`
- **WHEN** `validateManagedSourceReviewers` runs during managed account initialization
- **THEN** `"Source A"` SHALL NOT be present in `run.sourcesWithoutReviewers`
- **AND** a WARN log SHALL mention manual review is unavailable

#### Scenario: Manual review enabled with reviewers allows scoring
- **GIVEN** `fusionEnableManualReview` is true
- **AND** managed source `"Source A"` has at least one reviewer in `run.reviewersBySourceId`
- **WHEN** `validateManagedSourceReviewers` runs
- **THEN** `"Source A"` SHALL NOT be present in `run.sourcesWithoutReviewers`

#### Scenario: Both automatic merge and manual review disabled skips scoring
- **GIVEN** `fusionEnableAutoMerge` is false
- **AND** `fusionEnableManualReview` is false
- **WHEN** `validateManagedSourceReviewers` runs for managed source `"Source A"`
- **THEN** `"Source A"` SHALL be present in `run.sourcesWithoutReviewers`
