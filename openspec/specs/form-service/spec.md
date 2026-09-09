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

### Requirement: Review forms SHALL use one Fusion review form definition per locale group

When `enableLocalization` is true, FormService MUST group an account's reviewers by **reviewer locale** and MUST create or reuse one Fusion review form definition per locale group. The definition name MUST use `buildFormName` with that group's locale (`[locale]` suffix). Definition labels (toggle, SELECT) and per-instance DESCRIPTION HTML MUST both use that locale. When localization is disabled, FormService MUST use a single English locale group and MUST NOT append a locale suffix.

#### Scenario: Two reviewers with different language attributes get two definitions

- **GIVEN** `enableLocalization` is true
- **AND** two reviewers of one managed account have supported identity language attributes `fr` and `de`
- **WHEN** FormService creates Fusion reviews for that account
- **THEN** it MUST create or reuse two Fusion review form definitions named with `[fr]` and `[de]`
- **AND** the French reviewer MUST receive an instance whose definition labels and DESCRIPTION HTML are French
- **AND** the German reviewer MUST receive an instance whose definition labels and DESCRIPTION HTML are German

#### Scenario: Localization disabled uses one English definition with no suffix

- **GIVEN** `enableLocalization` is false
- **AND** reviewers have non-English identity language attributes
- **WHEN** FormService creates Fusion reviews for that account
- **THEN** it MUST create or reuse a single Fusion review form definition
- **AND** the definition name MUST NOT include a `[locale]` suffix
- **AND** form strings MUST be English

### Requirement: Pending Fusion reviews SHALL stay one per reviewer across locale groups

FormService MUST treat a reviewer as already having a Fusion review for a managed account when that reviewer is a recipient of a pending instance on **any** locale-group definition for that account. FormService MUST NOT create a second instance because the reviewer's locale differs from the pending instance's definition locale, including when the identity language attribute changed since the instance was created.

#### Scenario: Distinct reviewers on different locale groups are not duplicate reviews

- **GIVEN** a managed account with a pending French instance for reviewer A and a pending German instance for reviewer B
- **WHEN** FormService evaluates existing recipients before creating instances
- **THEN** reviewer A MUST be treated as already reviewed in French
- **AND** reviewer B MUST be treated as already reviewed in German
- **AND** FormService MUST NOT treat those two instances as two reviews for the same person

#### Scenario: Language attribute change does not reissue an in-flight review

- **GIVEN** a reviewer has a pending Fusion review instance on a French locale-group definition
- **AND** the reviewer's identity language attribute is now `de`
- **WHEN** FormService creates Fusion reviews for that account
- **THEN** FormService MUST NOT create a German instance for that reviewer
- **AND** the pending French instance MUST remain the in-flight review

### Requirement: Stale localized-definition refresh SHALL use the locale group's reviewer locale

When localization is enabled, FormService MUST evaluate `shouldRefreshLocalizedFormDefinition` (and any recreate or patch) for each Fusion review form definition against that definition's locale group locale. FormService MUST NOT refresh a definition solely because a different locale group or `defaultLanguage` differs from that definition's locale.

#### Scenario: French definition is not refreshed for a German defaultLanguage

- **GIVEN** `enableLocalization` is true and `defaultLanguage` is `de`
- **AND** a French locale-group definition already has French labels matching locale `fr`
- **WHEN** FormService prepares the French locale group
- **THEN** it MUST NOT treat that definition as stale solely because `defaultLanguage` is `de`

### Requirement: Reset forms SHALL delete every locale variant of matching Fusion review form definitions

`deleteExistingForms` MUST delete every Fusion review form definition whose name matches `fusionFormNamePattern`, including `[locale]`-suffixed variants for the same managed account. It MUST NOT delete only the `defaultLanguage` named definition while leaving other locale variants.

#### Scenario: Reset forms deletes French and German variants for the same account

- **GIVEN** two Fusion review form definitions for one managed account named with `[fr]` and `[de]`
- **WHEN** `deleteExistingForms` runs
- **THEN** both definitions MUST be deleted
- **AND** leftover in-flight instances for those definitions MUST be cancelled or closed

### Requirement: Review forms SHALL localize to reviewer locale when localization is enabled

When `enableLocalization` is true, the form service MUST translate user-facing review form strings (section labels, descriptions, toggle labels, helpText, score display text) using `locales.ts` and `translate()`. The locale MUST be the **reviewer locale** from `EmailService.getRecipientLocale` (identity language attribute, then `defaultLanguage`, then English). Definition labels and per-instance DESCRIPTION HTML MUST use the same reviewer locale. When localization is disabled, forms MUST remain English. When no supported identity language or `defaultLanguage` is configured, forms MUST fall back to English.

#### Scenario: Localization enabled with French defaultLanguage

- **GIVEN** `enableLocalization` is true and `defaultLanguage` is `fr`
- **AND** the reviewer has no supported identity language attribute
- **WHEN** `FormService` creates a fusion review form definition for that reviewer's locale group
- **THEN** translatable form field labels and helpText MUST be French from `locales.ts`

#### Scenario: Reviewer language attribute sets form locale

- **GIVEN** `enableLocalization` is true and `defaultLanguage` is unset (English fallback)
- **AND** the reviewer identity has a supported language attribute set to `ja`
- **WHEN** `FormService` creates a fusion review form definition for that reviewer's locale group
- **THEN** form strings MUST be Japanese
- **AND** MUST NOT stay English solely because `defaultLanguage` is unset
- **AND** the Fusion review email for that reviewer MUST also be Japanese via the same reviewer locale

#### Scenario: Localization disabled

- **GIVEN** `enableLocalization` is false
- **WHEN** `FormService` creates a form definition
- **THEN** form strings MUST be English

#### Scenario: Unsupported defaultLanguage falls back to English

- **GIVEN** `enableLocalization` is true and `defaultLanguage` is unsupported
- **AND** the reviewer has no supported identity language attribute
- **WHEN** a form definition is built
- **THEN** strings MUST fall back to English via `translate()`

### Requirement: Form locale dictionary keys SHALL cover all formBuilder user-facing strings

`locales.ts` MUST define `form_*` keys for every user-facing literal in `formBuilder.ts` (toggle configs, section descriptions by source type, decision labels, identity select helpText, score fragments, parameterized headers). Each key MUST exist in all ten supported locales.

#### Scenario: formBuilder uses translate for all user-facing strings

- **GIVEN** localization is enabled with `defaultLanguage` `es`
- **WHEN** `buildFormFields` runs with locale `es`
- **THEN** no hardcoded English user-facing literals MUST remain outside `translate()` / `translateWithParams()`

### Requirement: Form definition stale checks SHALL use FusionRun current time

When evaluating whether a form definition is stale during `fetchFormInstances` stale cleanup, FormService MUST compare the form definition timestamp against a cutoff derived from `FusionRun.currentTimeMs()` and `fusionFormExpirationDays`, not bare wall-clock `Date.now()`.

#### Scenario: Form active at recorded replay time

- **GIVEN** `fusionFormExpirationDays` is 7
- **AND** a form definition was created 3 days before the simulated replay time
- **AND** FusionRun simulated time is set to the recorded step timestamp
- **WHEN** `fetchFormInstances({ staleFormCleanup: true })` runs in replay mode
- **THEN** the form definition MUST be classified as active
- **AND** MUST NOT be queued for deletion solely due to wall-clock age

#### Scenario: Form stale at recorded replay time

- **GIVEN** `fusionFormExpirationDays` is 7
- **AND** a form definition was created 10 days before the simulated replay time
- **WHEN** stale cleanup runs with simulated time set to the recorded step timestamp
- **THEN** the form definition MUST be classified as stale
- **AND** MAY be queued for deletion per existing stale cleanup rules

#### Scenario: Live aggregation unchanged without simulated time

- **GIVEN** FusionRun has no simulated time set
- **WHEN** stale cleanup runs during a live aggregation
- **THEN** cutoff calculation MUST use wall-clock time via `currentTimeMs()`
- **AND** behavior MUST match pre-change production semantics

### Requirement: Review form display SHALL use DESCRIPTION HTML aligned with the Fusion review email

The form service MUST present the entire Fusion review form display surface (header, account context, configured form attributes, candidate match details) as ISC Custom Forms DESCRIPTION elements whose content is HTML. Launch-time formInput MUST supply those HTML strings. DESCRIPTION `config.description` MAY interpolate `{{$.form.input.<key>}}`. Display MUST NOT use TEXT elements for account attributes, candidate attributes, or score rows. Interactive decision controls MUST remain the `newIdentity` TOGGLE and the identities SEARCH_V2 SELECT. HTML MUST be escaped for untrusted values. Identity and human-account links MUST use `UrlContext` when a URL exists; otherwise the label MUST be escaped plain text. Visual tokens MUST match the Fusion review email: link color `#0b5cab`; score-row backgrounds match `#f0fdf4`, miss `#fef2f2`, fusion/average `#e0f2fe`.

#### Scenario: New review form uses HTML for the whole display surface

- **GIVEN** a Fusion account with configured form attributes and one or more identity candidates
- **WHEN** the form service builds the Fusion review form definition and instance input
- **THEN** account context, form attributes, and candidate score details MUST be DESCRIPTION HTML
- **AND** MUST NOT be TEXT fields for those display values
- **AND** the definition MUST still include the `newIdentity` TOGGLE and identities SELECT

#### Scenario: Candidate score table matches the review email columns

- **GIVEN** a candidate with attribute scores
- **WHEN** the form service renders candidate HTML
- **THEN** the table MUST include columns for attribute, value, algorithm, threshold, result, and score
- **AND** match, miss, and fusion/average rows MUST use the review-email background colors

#### Scenario: Identity and account links when UrlContext can build them

- **GIVEN** UrlContext can build an identity URL and a human-account URL
- **WHEN** the form service renders DESCRIPTION HTML
- **THEN** the account label MUST be an anchor to the human-account URL
- **AND** each candidate identity name MUST be an anchor to the identity URL
- **AND** anchors MUST use `target="_blank"` and `rel="noopener noreferrer"`

#### Scenario: Missing URL falls back to escaped text

- **GIVEN** UrlContext cannot build an account or identity URL
- **WHEN** the form service renders DESCRIPTION HTML
- **THEN** the label MUST appear as escaped text
- **AND** MUST NOT include an `href`

#### Scenario: Untrusted values are HTML-escaped

- **GIVEN** an attribute value containing markup characters
- **WHEN** the form service interpolates that value into DESCRIPTION HTML
- **THEN** the value MUST be HTML-escaped

### Requirement: All form candidates SHALL remain visible

The form service MUST include every candidate retained for the review form (capped by `fusionMaxCandidatesForForm`) in the candidate DESCRIPTION HTML at once. Form conditions MUST NOT hide other candidates when the identities SELECT changes. Per-account Fusion review form definitions and SEARCH_V2 candidate id queries MUST remain.

#### Scenario: Multiple candidates stay visible together

- **GIVEN** a review form with two identity candidates
- **WHEN** the form definition and conditions are built
- **THEN** both candidates MUST appear in the candidate HTML
- **AND** conditions MUST NOT HIDE a candidate section based on the identities SELECT value

#### Scenario: Per-account definition naming unchanged

- **GIVEN** a managed account that needs a Fusion review
- **WHEN** the form service creates or reuses a form definition
- **THEN** the definition name MUST still be built from `fusionFormNamePattern` plus that account’s identity
- **AND** the identities SELECT SEARCH_V2 query MUST still restrict to that form’s candidate identity ids

### Requirement: Decision processing keys SHALL remain unchanged

Form instance processing MUST continue to read `account`, `name`, `source`, `candidates`, optional `identityId`, the `newIdentity` toggle, and the identities SELECT. Display HTML formInput keys MUST NOT be required to produce a FusionDecision.

#### Scenario: Processor ignores display HTML keys

- **GIVEN** a completed review form instance whose formInput includes DESCRIPTION HTML blobs plus the existing decision keys
- **WHEN** the form processor creates a FusionDecision
- **THEN** the decision MUST be produced from the existing decision keys
- **AND** MUST NOT require display HTML keys to be present

