## ADDED Requirements

_(none)_

---

## MODIFIED Requirements

### Requirement: Review form and Reset Fusion state guides SHALL describe HTML restyle and Reset forms recut

The Review forms and reviewers Use guide MUST describe that the Fusion review form display is DESCRIPTION HTML aligned with the Fusion review email (score table, colors, identity and account links), that every candidate's score table stays visible, and that an identity details panel (form attributes for the identity chosen in the identities SELECT) appears under that SELECT. The new-identity / no-match toggle and identities SELECT MUST remain the decision controls. The Reset Fusion state Use guide MUST state that in-flight reviews keep their existing layout until **Reset forms?** closes them, after which rematch can issue updated instances. The guides MUST NOT instruct operators to reset a single review as a supported connector flag. Field tables MUST remain in Configuration reference; these guides MUST link to those anchors.

#### Scenario: Review forms guide describes the HTML layout

- **GIVEN** the documentation site is published
- **WHEN** a reader opens the Review forms and reviewers Use guide
- **THEN** the page SHALL describe DESCRIPTION HTML aligned with the Fusion review email
- **AND** SHALL state that the toggle and identities SELECT remain the decision controls
- **AND** SHALL state that score tables for all candidates remain visible
- **AND** SHALL state that identity details for the selected identity appear from the identities SELECT

#### Scenario: Reset Fusion state guide describes recut of in-flight reviews

- **GIVEN** the documentation site is published
- **WHEN** a reader opens the Reset Fusion state Use guide
- **THEN** the page SHALL state that **Reset forms?** closes in-flight Fusion reviews
- **AND** SHALL state that a form layout change does not migrate pending instances without that flag
- **AND** SHALL NOT document a per-account review reset flag

---

## REMOVED Requirements

_(none)_
