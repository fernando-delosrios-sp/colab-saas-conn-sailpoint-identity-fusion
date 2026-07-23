# form-service Spec

## Purpose

The form service (`src/services/formService/`) builds the SailPoint form payloads that the connector sends when requesting access changes. It owns the friendly-algorithm name catalog (kept in sync with `connector-spec.json`), the request/response types (`src/services/formService/types.ts`), and the helpers that build, validate, and serialize form submissions. This spec defines the contract between the form definitions configured by integrators and the JSON the connector actually transmits to IdentityIQ / ISC.

## Requirements

### Requirement: Form payloads MUST be built from the configured form definitions

The form service MUST construct outgoing form payloads from the operator-configured form definitions rather than synthesizing them ad-hoc. The friendly-algorithm name catalog MUST be kept in sync with `connector-spec.json` so that any algorithm name used in a form definition resolves to the same name the connector advertises.

#### Scenario: A form definition resolves to a recognizable algorithm name

- **GIVEN** a form definition references an algorithm with the friendly name "Exact"
- **WHEN** the form service builds the outgoing payload
- **THEN** the algorithm name in the payload matches the friendly name in `connector-spec.json`
- **AND** the payload passes the form validation helper without modification

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
- **THEN** it SHALL use run.formsToDelete, run.formDeleteQueue, run.pendingFormDeleteTasks, run.queuedFormDeleteIds, and run.activeFormDeleteWorkers
- **AND** there SHALL be no `formsToDelete`, `formDeleteQueue`, `pendingFormDeleteTasks`, `queuedFormDeleteIds`, or `activeFormDeleteWorkers` fields on FormService

#### Scenario: Public getters for counters delegate to FusionRun
- **WHEN** external code reads FormService.formsCreated or similar counter getters
- **THEN** the getter SHALL delegate to run.formsCreated
- **AND** the getter SHALL remain on FormService for backward compatibility but SHALL NOT own independent state

### Requirement: Dictionary form-input fields SHALL resolve via direct key lookup with id-aligned fallback

When form input is a dictionary of input definition objects, `readCorrelatedIdentityId`, `extractAccountInfoFromFormInput`, and `extractCandidateIdsFromFormInput` SHALL attempt direct property access on the expected field id (`account`, `name`, `source`, `candidates`, or `FusionAttribute.IdentityId`) before scanning remaining entries. The helpers SHALL NOT use `Object.values()` to materialize inputs for lookup. When direct key access does not yield a matching input object, the helpers SHALL iterate dictionary entries and select the first object whose `id` matches the target field and satisfies the same value/description predicates as the pre-optimization implementation. Flat form-input structures SHALL continue to be handled without regression.

#### Scenario: Flat form input extracts account and candidates unchanged
- **GIVEN** a flat form input `{ account: 'src::nat', name: 'Account One', source: 'HR', candidates: 'uuid-1,uuid-2' }`
- **WHEN** `extractAccountInfoFromFormInput` and `extractCandidateIdsFromFormInput` are called
- **THEN** account info SHALL equal `{ id: 'src::nat', name: 'Account One', sourceName: 'HR' }`
- **AND** candidate ids SHALL equal `['uuid-1', 'uuid-2']`

#### Scenario: Dictionary form input with arbitrary keys resolves by input id
- **GIVEN** a dictionary form input `{ a: { id: 'account', value: 'src::nat' }, b: { id: 'candidates', value: 'id-x,id-y' } }`
- **WHEN** `extractAccountInfoFromFormInput` and `extractCandidateIdsFromFormInput` are called
- **THEN** account info SHALL include `id: 'src::nat'`
- **AND** candidate ids SHALL equal `['id-x', 'id-y']`

#### Scenario: Direct key lookup when dictionary keys match field ids
- **GIVEN** a dictionary form input `{ account: { id: 'account', value: 'src::nat' }, candidates: { id: 'candidates', value: 'only-keyed' } }`
- **WHEN** the extractors run
- **THEN** account id SHALL be `'src::nat'`
- **AND** candidate ids SHALL equal `['only-keyed']`
- **AND** no full values-array allocation SHALL be required for lookup

#### Scenario: Description fallback when value is empty
- **GIVEN** a dictionary form input `{ c: { id: 'candidates', description: 'only-desc' } }`
- **WHEN** `extractCandidateIdsFromFormInput` is called
- **THEN** candidate ids SHALL equal `['only-desc']`

#### Scenario: Correlated identity id from dictionary input
- **GIVEN** a dictionary form input containing an entry whose `id` equals `FusionAttribute.IdentityId` with a non-empty `value` or `description`
- **WHEN** `readCorrelatedIdentityId` is invoked via `createFusionDecision`
- **THEN** the resulting decision SHALL include the correlated identity id string

