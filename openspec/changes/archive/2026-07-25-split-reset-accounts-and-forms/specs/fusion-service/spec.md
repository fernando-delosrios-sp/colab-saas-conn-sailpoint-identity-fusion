## ADDED Requirements

### Requirement: FusionService SHALL expose independent reset flag accessors

FusionService SHALL expose `isResetAccounts()` and `isResetForms()` methods that reflect the corresponding Developer Settings values loaded at construction time. The legacy `isReset()` method SHALL NOT be used.

#### Scenario: Flag accessors reflect config

- **GIVEN** FusionConfig with `resetAccounts: true` and `resetForms: false`
- **WHEN** FusionService is constructed
- **THEN** `isResetAccounts()` SHALL return `true`
- **AND** `isResetForms()` SHALL return `false`

### Requirement: FusionService SHALL auto-disable reset flags in source configuration

FusionService SHALL provide `disableResetAccounts()` and `disableResetForms()` methods that patch the fusion source connector attributes back to `false` after a reset flag is consumed. `disableResetAccounts()` SHALL patch both `/connectorAttributes/resetAccounts` and the legacy `/connectorAttributes/reset` path. `disableResetForms()` SHALL patch `/connectorAttributes/resetForms`.

#### Scenario: disableResetAccounts clears legacy key

- **WHEN** `disableResetAccounts()` is called on a persistent run
- **THEN** the connector SHALL patch `resetAccounts` to `false`
- **AND** the connector SHALL patch legacy `reset` to `false`

#### Scenario: disableResetForms clears forms flag only

- **WHEN** `disableResetForms()` is called on a persistent run
- **THEN** the connector SHALL patch `resetForms` to `false`
- **AND** the connector SHALL NOT modify `resetAccounts` or legacy `reset`
