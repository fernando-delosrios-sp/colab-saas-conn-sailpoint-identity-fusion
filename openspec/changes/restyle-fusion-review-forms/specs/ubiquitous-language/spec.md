## ADDED Requirements

### Requirement: Glossary defines Fusion review form definition, DESCRIPTION HTML, and in-flight review

The ubiquitous-language glossary SHALL define **Fusion review form definition** as the ISC Custom Forms definition named from `fusionFormNamePattern` plus the managed account’s identity, used as the template for that account’s Fusion review instance(s). It SHALL define **DESCRIPTION HTML** as ISC Custom Forms DESCRIPTION element content rendered as HTML, including `{{$.form.input.<key>}}` interpolation of launch-time formInput strings. It SHALL define **in-flight review** as a Fusion review form instance that is still pending (not a response and not cancelled), which holds the managed account off the Match work queue. **Reset forms** SHALL remain the Developer Setting (`resetForms`) that closes in-flight Fusion reviews by deleting matching Fusion review form definitions (and leftover instances). These terms SHALL NOT mean a single shared definition for all reviews, a TEXT display field, stale-by-expiration cleanup, or **Reset accounts**.

#### Scenario: Glossary entry for Fusion review form definition

- **GIVEN** a reader opens the Review and decision domain glossary table
- **WHEN** they look up the ISC definition that backs a Fusion review
- **THEN** it SHALL contain a **Fusion review form definition** entry distinct from the review form instance

#### Scenario: Glossary entry for DESCRIPTION HTML

- **GIVEN** a reader opens the Review and decision domain glossary table
- **WHEN** they look up how Fusion review display HTML is rendered
- **THEN** it SHALL contain a **DESCRIPTION HTML** entry that names DESCRIPTION elements and formInput interpolation
- **AND** it SHALL NOT treat TEXT fields as the HTML display surface

#### Scenario: Glossary entry for in-flight review

- **GIVEN** a reader opens the Review and decision domain glossary table
- **WHEN** they look up a pending Fusion review that holds a managed account off Match
- **THEN** it SHALL contain an **in-flight review** entry
- **AND** it SHALL distinguish that state from stale-by-expiration form cleanup and from stuck processing

---

## MODIFIED Requirements

_(none)_

---

## REMOVED Requirements

_(none)_
