## ADDED Requirements

### Requirement: Review form SHALL show identity details for the selected identities SELECT value

The form service MUST add one DESCRIPTION element per identity candidate retained for the review form (capped by `fusionMaxCandidatesForForm`). Each element's HTML MUST present that candidate like the account context panel: the identity display name (UrlContext identity link when a URL exists, otherwise escaped text) and the same configured form attributes in a two-column attribute/value table. Launch-time formInput MUST supply those HTML strings on index keys `identityHtml0` … `identityHtmlN-1` in candidate list order. DESCRIPTION `config.description` MUST interpolate `{{$.form.input.identityHtmlN}}` for the matching index. Identity details DESCRIPTION elements MUST sit in the identities (decision) section below the `newIdentity` TOGGLE and identities SELECT. Display MUST NOT use TEXT elements for identity form attributes.

Form conditions MUST HIDE each identity details element when the identities SELECT value is not that candidate's identities-SELECT label (`Candidate.name` after enrichment) or when `newIdentity` is true. Empty SELECT MUST leave every identity details element hidden. Conditions MUST NOT HIDE the stacked candidate score-table DESCRIPTION.

#### Scenario: Selected candidate identity details are shown

- **GIVEN** a review form with two identity candidates and configured form attributes
- **WHEN** the form definition, inputs, and conditions are built
- **THEN** there MUST be one identity details DESCRIPTION per candidate interpolating `identityHtml0` and `identityHtml1`
- **AND** each identity details HTML MUST include that candidate's identity display name
- **AND** MUST include the same form attribute names as the account context panel, with values from that candidate

#### Scenario: Unselected candidate identity details are hidden

- **GIVEN** a review form with two identity candidates
- **WHEN** the form conditions are built
- **THEN** each identity details element MUST have a HIDE condition when the identities SELECT value is not that candidate's identities-SELECT label

#### Scenario: Empty identities SELECT hides identity details

- **GIVEN** a review form with one or more identity candidates
- **WHEN** the identities SELECT has no value
- **THEN** every identity details element MUST remain hidden

#### Scenario: New-identity toggle hides identity details

- **GIVEN** a review form with identity candidates
- **WHEN** `newIdentity` is true
- **THEN** every identity details element MUST be hidden
- **AND** MUST stay hidden even if the identities SELECT still holds a candidate label

#### Scenario: Identity details omit the attribute table when no form attributes are configured

- **GIVEN** a review form whose configured form attribute list is empty
- **WHEN** identity details HTML is rendered
- **THEN** the identity display name MUST still appear
- **AND** the two-column form-attributes table MUST be omitted

---

## MODIFIED Requirements

### Requirement: Review form display SHALL use DESCRIPTION HTML aligned with the Fusion review email

The form service MUST present the entire Fusion review form display surface (header, account context, configured form attributes, selected-identity details, candidate match details) as ISC Custom Forms DESCRIPTION elements whose content is HTML. Launch-time formInput MUST supply those HTML strings. DESCRIPTION `config.description` MAY interpolate `{{$.form.input.<key>}}`. Display MUST NOT use TEXT elements for account attributes, candidate attributes, identity details, or score rows. Interactive decision controls MUST remain the `newIdentity` TOGGLE and the identities SEARCH_V2 SELECT. HTML MUST be escaped for untrusted values. Identity and human-account links MUST use `UrlContext` when a URL exists; otherwise the label MUST be escaped plain text. Visual tokens MUST match the Fusion review email: link color `#0b5cab`; score-row backgrounds match `#f0fdf4`, miss `#fef2f2`, fusion/average `#e0f2fe`.

#### Scenario: New review form uses HTML for the whole display surface

- **GIVEN** a Fusion account with configured form attributes and one or more identity candidates
- **WHEN** the form service builds the Fusion review form definition and instance input
- **THEN** account context, form attributes, identity details, and candidate score details MUST be DESCRIPTION HTML
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

The form service MUST include every candidate retained for the review form (capped by `fusionMaxCandidatesForForm`) in the candidate score-table DESCRIPTION HTML at once. Form conditions MUST NOT hide other candidates' score tables when the identities SELECT changes. Form conditions MAY HIDE identity details DESCRIPTION elements based on the identities SELECT and `newIdentity`. Per-account Fusion review form definitions and SEARCH_V2 candidate id queries MUST remain.

#### Scenario: Multiple candidates stay visible together

- **GIVEN** a review form with two identity candidates
- **WHEN** the form definition and conditions are built
- **THEN** both candidates MUST appear in the candidate score-table HTML
- **AND** conditions MUST NOT HIDE the candidate score-table DESCRIPTION based on the identities SELECT value

#### Scenario: Per-account definition naming unchanged

- **GIVEN** a managed account that needs a Fusion review
- **WHEN** the form service creates or reuses a form definition
- **THEN** the definition name MUST still be built from `fusionFormNamePattern` plus that account’s identity
- **AND** the identities SELECT SEARCH_V2 query MUST still restrict to that form’s candidate identity ids

---

## REMOVED Requirements

_(none)_
