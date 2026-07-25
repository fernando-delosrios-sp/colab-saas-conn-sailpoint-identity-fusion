## ADDED Requirements

### Requirement: Setup phase SHALL handle independent resetAccounts and resetForms flags

During Phase 1 Setup of a persistent account-list aggregation, the connector SHALL evaluate `resetForms` and `resetAccounts` independently. When `resetForms` is enabled, the connector SHALL delete all Fusion review form definitions via `FormService.deleteExistingForms()`, patch `resetForms` back to `false`, and continue Setup unless `resetAccounts` is also enabled. When `resetAccounts` is enabled, the connector SHALL patch `resetAccounts` back to `false` (and legacy `reset` to `false` if present), clear persisted fusion state, reset batch cumulative counters, and return from Setup without proceeding to later phases (zero accounts emitted).

#### Scenario: resetAccounts only clears accounts and exits

- **GIVEN** a persistent aggregation with `resetAccounts` enabled and `resetForms` disabled
- **WHEN** Setup runs
- **THEN** the connector SHALL NOT call `FormService.deleteExistingForms()`
- **AND** the connector SHALL clear fusion state and exit Setup early with zero accounts
- **AND** the connector SHALL patch `resetAccounts` to `false`

#### Scenario: resetForms only deletes forms and continues

- **GIVEN** a persistent aggregation with `resetForms` enabled and `resetAccounts` disabled
- **WHEN** Setup runs
- **THEN** the connector SHALL call `FormService.deleteExistingForms()`
- **AND** the connector SHALL patch `resetForms` to `false`
- **AND** Setup SHALL continue through the normal aggregation pipeline

#### Scenario: Both flags enabled deletes forms then resets accounts

- **GIVEN** a persistent aggregation with both `resetAccounts` and `resetForms` enabled
- **WHEN** Setup runs
- **THEN** the connector SHALL delete forms before clearing fusion state
- **AND** the connector SHALL patch both flags to `false`
- **AND** Setup SHALL exit early with zero accounts

#### Scenario: Dry-run skips reset side effects

- **GIVEN** a dry-run aggregation with `resetAccounts` or `resetForms` enabled
- **WHEN** Setup runs
- **THEN** the connector SHALL NOT delete forms, patch config, or clear fusion state
- **AND** when `resetAccounts` is enabled, Setup SHALL still exit early without emitting accounts

### Requirement: Developer settings SHALL expose resetAccounts and resetForms with false defaults

The connector configuration parser SHALL read `resetAccounts` and `resetForms` as boolean Developer Settings. Both SHALL default to `false` when omitted. The parser SHALL treat legacy `reset` as `resetAccounts` when `resetAccounts` is not explicitly set.

#### Scenario: Omitted flags default to false

- **WHEN** developer settings are parsed without `resetAccounts` or `resetForms`
- **THEN** both values SHALL be `false`

#### Scenario: Legacy reset key maps to resetAccounts

- **WHEN** developer settings contain `reset: true` and no `resetAccounts` key
- **THEN** `resetAccounts` SHALL be `true`
- **AND** `resetForms` SHALL remain `false` unless explicitly set
