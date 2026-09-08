## ADDED Requirements

_(none)_

---

## MODIFIED Requirements

### Requirement: Setup phase SHALL handle independent resetAccounts and resetForms flags

During Phase 1 Setup of a persistent account-list aggregation, the connector SHALL evaluate `resetForms` and `resetAccounts` independently. When `resetForms` is enabled, the connector SHALL close in-flight Fusion reviews: it SHALL delete all Fusion review form definitions matching the Fusion form name pattern via `FormService.deleteExistingForms()`, and if ISC leaves form instances for those definitions, it SHALL cancel or delete those instances in the same Setup pass so no open Fusion review instances remain for the deleted definitions. The connector SHALL then patch `resetForms` back to `false`, and continue Setup unless `resetAccounts` is also enabled. When `resetAccounts` is enabled, the connector SHALL patch `resetAccounts` back to `false` (and legacy `reset` to `false` if present), clear persisted fusion state, reset batch cumulative counters, and return from Setup without proceeding to later phases (zero accounts emitted). Setup MUST NOT patch or replace still-pending Fusion review form definitions on a normal aggregation solely to apply a newer form layout.

#### Scenario: resetAccounts only clears accounts and exits

- **GIVEN** a persistent aggregation with `resetAccounts` enabled and `resetForms` disabled
- **WHEN** Setup runs
- **THEN** the connector SHALL NOT call `FormService.deleteExistingForms()`
- **AND** the connector SHALL clear fusion state and exit Setup early with zero accounts
- **AND** the connector SHALL patch `resetAccounts` to `false`

#### Scenario: resetForms only closes in-flight reviews and continues

- **GIVEN** a persistent aggregation with `resetForms` enabled and `resetAccounts` disabled
- **AND** Fusion review form definitions exist with open instances
- **WHEN** Setup runs
- **THEN** the connector SHALL call `FormService.deleteExistingForms()`
- **AND** those in-flight reviews SHALL be closed (no remaining open instances for the deleted definitions)
- **AND** the connector SHALL patch `resetForms` to `false`
- **AND** Setup SHALL continue through the normal aggregation pipeline
- **AND** managed accounts previously held by those reviews SHALL be eligible to rematch on the same run

#### Scenario: Both flags enabled deletes forms then resets accounts

- **GIVEN** a persistent aggregation with both `resetAccounts` and `resetForms` enabled
- **WHEN** Setup runs
- **THEN** the connector SHALL close Fusion reviews before clearing fusion state
- **AND** the connector SHALL patch both flags to `false`
- **AND** Setup SHALL exit early with zero accounts

#### Scenario: Dry-run skips reset side effects

- **GIVEN** a dry-run aggregation with `resetAccounts` or `resetForms` enabled
- **WHEN** Setup runs
- **THEN** the connector SHALL NOT delete forms, cancel instances, patch config, or clear fusion state
- **AND** when `resetAccounts` is enabled, Setup SHALL still exit early without emitting accounts

#### Scenario: Restyle does not migrate pending instances without Reset forms

- **GIVEN** an in-flight Fusion review whose definition was created before a form layout change
- **AND** `resetForms` is disabled
- **WHEN** a persistent aggregation runs
- **THEN** the connector SHALL NOT replace that pending definition solely to apply the new layout
- **AND** the in-flight review SHALL remain until the reviewer responds, the form expires, or **Reset forms?** runs

---

## REMOVED Requirements

_(none)_
