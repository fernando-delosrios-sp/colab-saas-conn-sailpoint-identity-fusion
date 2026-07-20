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

FormService SHALL read and write per-run form decision state through FusionRun rather than through private instance fields. Public getters for fusionIdentityDecisions, pendingCandidateIdentityIds, pendingReviewUrlsByReviewerId, and pendingReviewUrlsByCandidateId SHALL be removed — callers SHALL access these collections directly from FusionRun.

#### Scenario: FormService populates form state on FusionRun
- **WHEN** FormService.processFetchedFormData processes answered form instances
- **THEN** fusion identity decisions SHALL be pushed to run.fusionIdentityDecisions
- **AND** pending candidate IDs SHALL be added to run.pendingCandidateIdentityIds
- **AND** pending review URLs SHALL be stored in run.pendingReviewUrlsByReviewerId and run.pendingReviewUrlsByCandidateId

#### Scenario: resetFormDataState clears FusionRun fields
- **WHEN** FormService.resetFormDataState is called
- **THEN** run.fusionIdentityDecisions, run.pendingCandidateIdentityIds, run.pendingReviewUrlsByReviewerId, and run.pendingReviewUrlsByCandidateId SHALL be cleared or re-initialized
