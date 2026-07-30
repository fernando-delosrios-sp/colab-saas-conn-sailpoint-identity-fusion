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

### Requirement: Pending Fusion review forms SHALL deplete the managed-account work queue during Fetch

When `FormService.processFetchedFormData` processes form instances for a Fusion review form that has pending (non-response) instances and `analyzeFormInstances` sets `shouldRemoveAccountFromMap` to true, FormService SHALL remove the referenced managed account from `run.managedAccountsById` before the Match phase runs. Removal SHALL use `run.claimAccount` with the composite managed-account key extracted from form input (normalized via `normalizeCompositeManagedAccountKey`). FormService SHALL perform the claim when the normalized key is present in run inventory (`run.hasManagedAccount`), preferring the work-queue entry for `identityId` when the account is still queued.

#### Scenario: Pending review removes account from work queue
- **GIVEN** a managed account on `run.managedAccountsById` with composite key `sourceId::nativeIdentity`
- **AND** a Fusion review form instance in pending state references that key in form input
- **WHEN** `processFetchedFormData` processes the instance batch
- **THEN** `shouldRemoveAccountFromMap` SHALL be true
- **AND** `run.claimAccount('sourceId::nativeIdentity', identityId)` SHALL be invoked
- **AND** the account SHALL NOT remain on `run.managedAccountsById` when the uncorrelated Match sweep starts

#### Scenario: Normalized form account id matches work queue key
- **GIVEN** form input account id differs from the canonical key only by whitespace or equivalent composite formatting
- **WHEN** `extractAccountInfoOverride` runs with `shouldRemoveAccountFromMap` true
- **THEN** FormService SHALL normalize the id before lookup and claim
- **AND** the account SHALL be removed from the work queue when inventory contains the normalized key

#### Scenario: Inventory retains key after pending-review claim
- **GIVEN** a pending-review claim removed the account from the work queue
- **WHEN** `run.hasManagedAccount(normalizedKey)` is queried later in the same run
- **THEN** it SHALL still return true
- **AND** `run.getManagedAccountInfo(normalizedKey)` SHALL return metadata for reporting and form overrides

### Requirement: Duplicate form-definition create conflicts SHALL recover by reusing existing definitions

When `getOrCreateFormDefinition` attempts to create a form definition and the ISC API responds with a conflict indicating another definition with the same name already exists, FormService SHALL retry lookup by exact name and reuse the existing definition instead of failing the partial-match path.

#### Scenario: Create conflict falls back to existing definition
- **GIVEN** `getFormDefinitionByName` returned no results
- **AND** `createFormDefinition` fails with a duplicate-name conflict for form name `N`
- **WHEN** FormService handles the error in `getOrCreateFormDefinition`
- **THEN** it SHALL invoke `getFormDefinitionByName('N')` again
- **AND** if a definition is found, it SHALL be returned without rethrowing the create error

### Requirement: Review forms SHALL localize to defaultLanguage when localization is enabled

When `enableLocalization` is true, the form service MUST translate user-facing review form strings (section labels, descriptions, toggle labels, helpText, score display text) using `locales.ts` and `translate()`. The locale MUST come from `resolveFormLocale(config)`, which uses **`defaultLanguage` only** as the authoritative source. Review form locale MUST NOT read `identityLanguageAttribute` or recipient identity language — even when the review email is localized to the recipient's language. When localization is disabled, forms MUST remain English. When no supported `defaultLanguage` is configured, forms MUST fall back to English.

#### Scenario: Localization enabled with French defaultLanguage

- **GIVEN** `enableLocalization` is true and `defaultLanguage` is `fr`
- **WHEN** `FormService` creates a fusion review form definition
- **THEN** translatable form field labels and helpText MUST be French from `locales.ts`

#### Scenario: Recipient language does not override form locale

- **GIVEN** `enableLocalization` is true and `defaultLanguage` is `en`
- **AND** the reviewer identity has a supported language attribute set to `ja`
- **WHEN** `FormService` creates a fusion review form definition
- **THEN** form strings MUST be English from `defaultLanguage`
- **AND** the review email MAY still be Japanese via `resolveEffectiveLocale` for that recipient

#### Scenario: Localization disabled

- **GIVEN** `enableLocalization` is false
- **WHEN** `FormService` creates a form definition
- **THEN** form strings MUST be English

#### Scenario: Unsupported defaultLanguage falls back to English

- **GIVEN** `enableLocalization` is true and `defaultLanguage` is unsupported
- **WHEN** a form definition is built
- **THEN** strings MUST fall back to English via `translate()`

### Requirement: Form locale dictionary keys SHALL cover all formBuilder user-facing strings

`locales.ts` MUST define `form_*` keys for every user-facing literal in `formBuilder.ts` (toggle configs, section descriptions by source type, decision labels, identity select helpText, score fragments, parameterized headers). Each key MUST exist in all ten supported locales.

#### Scenario: formBuilder uses translate for all user-facing strings

- **GIVEN** localization is enabled with `defaultLanguage` `es`
- **WHEN** `buildFormFields` runs with locale `es`
- **THEN** no hardcoded English user-facing literals MUST remain outside `translate()` / `translateWithParams()`


