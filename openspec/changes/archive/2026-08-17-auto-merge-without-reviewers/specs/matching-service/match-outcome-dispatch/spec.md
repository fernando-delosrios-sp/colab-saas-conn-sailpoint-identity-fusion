# match-outcome-dispatch Delta Spec

## ADDED Requirements

### Requirement: Match scoring runs when automatic merge or manual review with reviewers is enabled

`MatchOutcomeDispatcher` SHALL enqueue managed accounts for Match scoring when the source is not present in `run.sourcesWithoutReviewers`. Sources enter that set when neither **`fusionEnableAutoMerge`** nor (**`fusionEnableManualReview`** with reviewers configured) applies.

#### Scenario: No-reviewer source with automatic merge enabled is scored
- **GIVEN** `fusionEnableAutoMerge` is true
- **AND** the managed source `"Source A"` has no reviewers in `run.reviewersBySourceId`
- **AND** `"Source A"` is not present in `run.sourcesWithoutReviewers`
- **WHEN** `runMatchSweep` processes an uncorrelated managed account from `"Source A"`
- **THEN** `MatchingService.scoreFusionAccount` SHALL be invoked for identity candidates
- **AND** the account SHALL NOT be finalized as a non-match before scoring completes

#### Scenario: Manual review enabled without reviewers and automatic merge disabled skips scoring
- **GIVEN** `fusionEnableAutoMerge` is false
- **AND** `fusionEnableManualReview` is true
- **AND** the managed source `"Source A"` is present in `run.sourcesWithoutReviewers`
- **WHEN** `runMatchSweep` processes an uncorrelated managed account from `"Source A"`
- **THEN** `MatchingService.scoreFusionAccount` SHALL NOT be invoked
- **AND** the account SHALL be finalized as a non-match without scoring

---

### Requirement: Post-score outcomes follow automatic merge then manual review

After scoring completes for an identity-match or deferred-match account, `MatchOutcomeDispatcher` SHALL evaluate outcomes in order: (1) apply automatic merge when **`fusionEnableAutoMerge`** is true and the combined score meets **`fusionAutoMergeScore`**; (2) when **`fusionEnableManualReview`** is true and the source has reviewers, route borderline outcomes to manual review (review form or deferred pending); (3) otherwise finalize an authoritative non-match. It SHALL NOT call `FormService.createFusionForm` when the manual review path is unavailable.

#### Scenario: Partial match without manual review path registers non-match
- **GIVEN** `fusionEnableAutoMerge` is true with `fusionAutoMergeScore` above the account's combined score
- **AND** the account's combined score meets the manual review threshold
- **AND** manual review is unavailable (`fusionEnableManualReview` is false **or** the source has zero reviewers)
- **WHEN** identity-match resolution does not produce an automatic merge
- **THEN** `MatchOutcomeDispatcher` SHALL finalize the account as an authoritative non-match
- **AND** `FormService.createFusionForm` SHALL NOT be called
- **AND** the sweep result SHALL count the outcome as `nonMatch`, not `partial`

#### Scenario: Partial match with manual review path creates review workflow
- **GIVEN** `fusionEnableManualReview` is true
- **AND** the managed source has at least one reviewer
- **AND** scoring produces a candidate above the manual review threshold but below automatic merge
- **WHEN** identity-match resolution runs
- **THEN** `MatchOutcomeDispatcher` SHALL route the account to manual review (partial-match resolution)
- **AND** `FormService.createFusionForm` SHALL be called

#### Scenario: Automatic merge without reviewers still merges
- **GIVEN** `fusionEnableAutoMerge` is true
- **AND** the managed source has zero reviewers
- **AND** scoring produces a candidate at or above `fusionAutoMergeScore` with all mandatory rules passing
- **WHEN** identity-match resolution runs
- **THEN** `MatchOutcomeDispatcher` SHALL apply automatic merge via synthetic FusionDecision
- **AND** `run.autoMergedIdentityIds` SHALL record the merge target
- **AND** `FormService.createFusionForm` SHALL NOT be called

#### Scenario: Deferred manual outcome without manual review path becomes non-match
- **GIVEN** `fusionEnableAutoMerge` is true
- **AND** manual review is unavailable for the managed source
- **AND** deferred drain scoring would defer the account for manual review or create a partial form
- **AND** automatic merge is not eligible for the best candidate
- **WHEN** deferred resolution completes
- **THEN** the account SHALL be finalized as an authoritative non-match
- **AND** `FormService.createFusionForm` SHALL NOT be called
