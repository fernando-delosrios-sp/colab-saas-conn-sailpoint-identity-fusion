## MODIFIED Requirements

### Requirement: missing-accounts attribute MUST restore uncorrelated account references

When a Fusion account is reconstructed from persisted platform attributes, the `missing-accounts` collection MUST be restored into the internal missing-account reference set. It MUST NOT be loaded from the correlated `accounts` collection.

Feature: Fusion account attribute resolution
Rule: Persisted `missing-accounts` values populate `_missingAccountIds`; persisted `accounts` values populate the previous/correlated account reference set.

#### Scenario: persisted missing-accounts are restored as missing references
- **GIVEN** a persisted Fusion account with `missing-accounts: ["src-a::user-1"]` and `accounts: ["src-a::user-2"]`
- **WHEN** the account is initialized via `FusionAccount.fromFusionAccount`
- **THEN** the missing-account reference set contains `"src-a::user-1"`
- **AND** the missing-account reference set does not contain `"src-a::user-2"`

#### Scenario: correlated accounts are not restored as missing references
- **GIVEN** a persisted Fusion account with `accounts: ["src-a::user-2"]` and no `missing-accounts` attribute
- **WHEN** the account is initialized via `FusionAccount.fromFusionAccount`
- **THEN** the missing-account reference set is empty
- **AND** the previous correlated account reference set contains `"src-a::user-2"`
