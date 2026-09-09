## ADDED Requirements

### Requirement: Glossary defines reviewer locale and locale group

The ubiquitous-language glossary SHALL define **reviewer locale** and **locale group**. **Reviewer locale** SHALL be the supported locale resolved for one reviewer identity (identity language attribute, then `defaultLanguage`, then English). **Locale group** SHALL be the set of an account's reviewers who share one reviewer locale. Agents and documentation SHALL NOT use **form locale**, recipient language, preferred language, reviewer batch, or language cohort for these meanings.

#### Scenario: Glossary lists reviewer locale

- **WHEN** the glossary is consulted for Fusion review language
- **THEN** it SHALL contain **reviewer locale**
- **AND** SHALL define it as the locale of everything that reviewer reads in the review email and the review form

#### Scenario: Glossary lists locale group

- **WHEN** the glossary is consulted for how multiple reviewers share a form definition
- **THEN** it SHALL contain **locale group**
- **AND** SHALL define it as the reviewers of one managed account who share one reviewer locale and therefore one Fusion review form definition

### Requirement: Fusion review form definition includes the locale dimension

The ubiquitous-language glossary SHALL define **Fusion review form definition** as the ISC Custom Forms definition named from `fusionFormNamePattern` plus the managed account’s identity and, when localization is enabled, the locale group’s reviewer locale. An account MAY have one definition per locale group. It SHALL NOT be a single shared definition for all reviews or for all reviewers of that account regardless of language.

#### Scenario: Fusion review form definition includes locale dimension

- **WHEN** the glossary is consulted for Fusion review form definition
- **THEN** the definition SHALL include the locale group dimension when localization is enabled
- **AND** SHALL NOT claim one definition per managed account with no locale dimension

---

## MODIFIED Requirements

_(none)_

---

## REMOVED Requirements

_(none)_

---

## RENAMED Requirements

_(none)_
