## ADDED Requirements

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

---

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

---

### Requirement: Decision processing keys SHALL remain unchanged

Form instance processing MUST continue to read `account`, `name`, `source`, `candidates`, optional `identityId`, the `newIdentity` toggle, and the identities SELECT. Display HTML formInput keys MUST NOT be required to produce a FusionDecision.

#### Scenario: Processor ignores display HTML keys

- **GIVEN** a completed review form instance whose formInput includes DESCRIPTION HTML blobs plus the existing decision keys
- **WHEN** the form processor creates a FusionDecision
- **THEN** the decision MUST be produced from the existing decision keys
- **AND** MUST NOT require display HTML keys to be present

---

## MODIFIED Requirements

_(none)_

---

## REMOVED Requirements

_(none)_
