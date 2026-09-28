## ADDED Requirements

### Requirement: Ownership-mode review forms describe owner identity selection

When FormService builds a review form for an account from an Ownership-mode source, the form SHALL tell the reviewer they are choosing an owner identity for that account. The form SHALL NOT describe that action as correlating the account or as merging the account into an identity. Assignment-mode Orphan review forms SHALL keep the existing wording that the reviewer merges the orphan account into an identity. Ownership-mode user-facing strings SHALL be locale dictionary keys present in all ten supported locales.

#### Scenario: Ownership review form describes an owner identity

- **GIVEN** a partial match for an account on an Ownership-mode source
- **WHEN** FormService builds the review form
- **THEN** the form SHALL describe choosing an owner identity
- **AND** the form SHALL NOT describe correlating or merging the account into an identity

#### Scenario: Assignment-mode orphan review form still describes a merge

- **GIVEN** a partial match for an account on an Orphan source in Assignment mode
- **WHEN** FormService builds the review form
- **THEN** the form SHALL describe merging the orphan account into an identity

#### Scenario: Ownership form strings exist in every supported locale

- **GIVEN** the Ownership-mode review form strings
- **WHEN** a reader checks the form locale dictionary
- **THEN** each string SHALL have a key in all ten supported locales
