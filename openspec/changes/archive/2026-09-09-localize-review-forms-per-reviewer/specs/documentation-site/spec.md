## ADDED Requirements

### Requirement: Reviewer Use guides SHALL state that Fusion review forms use reviewer locale

`docs/use-guides/configuration/managing-reviewers.md` and `docs/use-guides/configuration/review-forms-and-reviewers.md` MUST state that when localization is enabled, Fusion review forms use **reviewer locale** (identity language attribute, then **Default Language**, then English), matching the Fusion review email. They MUST NOT state that review forms use **Default Language** only or that form definitions are shared as one locale for every reviewer of an account.

#### Scenario: Operator reads localization and reviewer experience

- **GIVEN** localization is documented in the Managing reviewers Use guide
- **WHEN** an operator reads how Fusion review forms pick a language
- **THEN** the guide SHALL say forms use the reviewer's language attribute when set
- **AND** SHALL NOT say forms always use **Default Language** only because one definition is shared across reviewers

---

## MODIFIED Requirements

_(none)_

---

## REMOVED Requirements

_(none)_

---

## RENAMED Requirements

_(none)_
