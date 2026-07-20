## MODIFIED Requirements

### Requirement: FormService MUST NOT own per-run form decision state

FormService SHALL read and write per-run form decision state through FusionRun rather than through private instance fields. Public getters for `fusionIdentityDecisions`, `pendingCandidateIdentityIds`, `pendingReviewUrlsByReviewerId`, and `pendingReviewUrlsByCandidateId` SHALL be removed — callers SHALL access these collections directly from FusionRun.

#### Scenario: FormService populates form state on FusionRun
- **WHEN** FormService.processFetchedFormData processes answered form instances
- **THEN** fusion identity decisions SHALL be pushed to run.fusionIdentityDecisions
- **AND** pending candidate IDs SHALL be added to run.pendingCandidateIdentityIds
- **AND** pending review URLs SHALL be stored in run.pendingReviewUrlsByReviewerId and run.pendingReviewUrlsByCandidateId

#### Scenario: resetFormDataState clears FusionRun fields
- **WHEN** FormService.resetFormDataState is called
- **THEN** run.fusionIdentityDecisions, run.pendingCandidateIdentityIds, run.pendingReviewUrlsByReviewerId, and run.pendingReviewUrlsByCandidateId SHALL be cleared or re-initialized
