## MODIFIED Requirements

### Requirement: FormService MUST NOT own per-run form decision state

FormService SHALL read and write per-run form state through FusionRun rather than through private instance fields. FormService SHALL NOT declare dead fossil fields (`_fusionIdentityDecisions`, `_pendingReviewUrlsByReviewerId`, `_pendingCandidateIdentityIds`, `_pendingReviewUrlsByCandidateId`) that were migrated to FusionRun in a prior change.

#### Scenario: FormService populates form state on FusionRun
- **WHEN** FormService.processFetchedFormData processes answered form instances
- **THEN** fusion identity decisions SHALL be pushed to run.fusionIdentityDecisions via run.addDecision()
- **AND** pending candidate IDs SHALL be added to run.pendingCandidateIdentityIds via run.addPendingCandidateId()
- **AND** pending review URLs SHALL be stored in run.pendingReviewUrlsByReviewerId and run.pendingReviewUrlsByCandidateId via run.addReviewUrlForReviewer() and run.addReviewUrlForCandidate()

#### Scenario: FormService has no dead fossil fields
- **WHEN** code review inspects FormService's class body
- **THEN** there SHALL be no `_fusionIdentityDecisions`, `_pendingReviewUrlsByReviewerId`, `_pendingCandidateIdentityIds`, or `_pendingReviewUrlsByCandidateId` fields declared on FormService

#### Scenario: resetFormDataState clears FusionRun fields
- **WHEN** FormService.resetFormDataState is called
- **THEN** run.clearDecisions(), run.clearReviewUrls(), and run.resetFormState() SHALL be called to clear or re-initialize form-related state
- **AND** FormService SHALL NOT directly assign `this._fusionIdentityDecisions = []` or similar

### Requirement: FormService delegates form counters and delete queue to FusionRun

FormService SHALL read and write form processing counters (`formsCreated`, `formInstancesCreated`, `formsFound`, `formInstancesFound`, `answeredFormInstancesProcessed`) and delete queue state via FusionRun rather than through private instance fields.

#### Scenario: Form counters live on FusionRun
- **WHEN** FormService creates a form, processes an instance, or counts forms
- **THEN** it SHALL call run.incrementFormsCreated(), run.incrementFormInstancesCreated(), etc.
- **AND** there SHALL be no `_formsCreated`, `_formInstancesCreated`, etc. private fields on FormService

#### Scenario: Delete queue state lives on FusionRun
- **WHEN** FormService queues a form for deletion, processes the delete queue, or resets deletion state
- **THEN** it SHALL call run.queueFormForDeletion(), run.isFormQueuedForDeletion(), run.getNextFormToDelete(), run.markFormDeletionComplete(), run.addPendingFormDeleteTask(), run.awaitPendingFormDeleteTasks(), and run.resetFormDeletionQueue()
- **AND** there SHALL be no `formsToDelete`, `formDeleteQueue`, `pendingFormDeleteTasks`, `queuedFormDeleteIds`, or `activeFormDeleteWorkers` fields on FormService

#### Scenario: Public getters for counters delegate to FusionRun
- **WHEN** external code reads FormService.formsCreated or similar counter getters
- **THEN** the getter SHALL delegate to run.formsCreated
- **AND** the getter SHALL remain on FormService for backward compatibility but SHALL NOT own independent state

## REMOVED Requirements

None.
