## ADDED Requirements

### Requirement: Normal definitions honor the refresh flag per definition

When `DefinitionService.refreshNormalAttributes` processes Normal attribute definitions, each definition SHALL respect its configured `refresh` flag in combination with account refresh signals. A definition with `refresh: false` SHALL NOT be evaluated when the Fusion account has an existing value, is not being reset, force attribute refresh is disabled, and `needsRefresh` is false. A definition with `refresh: true` SHALL still be evaluated on every aggregation even when `needsRefresh` is false.

#### Scenario: refresh false skips unchanged account

- **GIVEN** a Normal definition with `refresh: false` and an existing non-empty attribute value
- **AND** the Fusion account has `needsRefresh: false` and `needsReset: false`
- **AND** force attribute refresh is disabled
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the definition SHALL NOT be evaluated
- **AND** the stored attribute value SHALL remain unchanged

#### Scenario: refresh true runs every aggregation

- **GIVEN** a Normal definition with `refresh: true`
- **AND** the Fusion account has `needsRefresh: false`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the definition SHALL be evaluated
- **AND** a newly rendered value SHALL replace the previous value when evaluation succeeds

#### Scenario: needsRefresh triggers refresh false definitions

- **GIVEN** a Normal definition with `refresh: false` and an existing value
- **AND** the Fusion account has `needsRefresh: true` because underlying managed source data changed
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the definition SHALL be evaluated

#### Scenario: force attribute refresh triggers refresh false definitions

- **GIVEN** a Normal definition with `refresh: false` and an existing value
- **AND** Developer Settings force attribute refresh is enabled for the run
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the definition SHALL be evaluated

### Requirement: Account-level Define entry does not force all accounts when any definition refreshes

`refreshNormalAttributes` SHALL enter the Normal definition loop when the Fusion account has `needsRefresh`, `needsReset`, or force attribute refresh enabled, or when at least one Normal definition has `refresh: true` and is eligible for evaluation on that account. It SHALL NOT treat the presence of any refresh-enabled definition in connector configuration as forcing Define for every Fusion account regardless of account refresh state.

#### Scenario: Stale account skips Define when no refresh true definitions apply

- **GIVEN** connector configuration where every Normal definition has `refresh: false`
- **AND** a Fusion account with `needsRefresh: false` and populated attribute values
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the method SHALL return without evaluating definitions

### Requirement: Normal Define reuses one render context per account refresh pass

During a single `refreshNormalAttributes` invocation for one Fusion account, `evaluateVelocityTemplate` SHALL NOT shallow-copy the full caller context on every definition evaluation. The implementation SHALL build one null-prototype render context per refresh pass, merge helpers once, and update that context with each definition write so later definitions observe earlier writes.

#### Scenario: Later definition sees earlier write without per-eval full copy

- **GIVEN** Normal definitions `first` then `second` where `second` expression references `$first`
- **WHEN** `refreshNormalAttributes` runs
- **THEN** `second` SHALL reflect the value written by `first`
- **AND** `Object.getPrototypeOf(renderContext)` SHALL be `null` for each evaluation

#### Scenario: Helper keys override caller context keys

- **GIVEN** a Velocity evaluation during Normal Define
- **WHEN** the render context is constructed for that refresh pass
- **THEN** exported context helpers SHALL remain accessible
- **AND** helper keys SHALL override same-named caller properties
