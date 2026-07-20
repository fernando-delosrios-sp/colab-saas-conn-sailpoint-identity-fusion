## ADDED Requirements

### Requirement: FusionRun holds form processing state

FusionRun SHALL contain the following form-related per-run state: fusion identity decisions, pending candidate identity IDs, and pending review URL mappings.

#### Scenario: FusionRun contains form decision state
- **WHEN** form decisions are processed during an operation run
- **THEN** run.fusionIdentityDecisions SHALL contain the processed fusion identity decisions
- **AND** run.pendingCandidateIdentityIds SHALL contain candidate identity IDs with pending form instances
- **AND** run.pendingReviewUrlsByReviewerId SHALL map reviewer identity IDs to pending form instance URLs
- **AND** run.pendingReviewUrlsByCandidateId SHALL map candidate identity IDs to pending form instance URLs
