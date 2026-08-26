## ADDED Requirements

### Requirement: Glossary defines New status entitlement

The ubiquitous-language glossary SHALL define **New** as a status entitlement whose wire value is `new`. Documentation and specs SHALL use that wire value, not synonyms such as `created` or `fresh`.

#### Scenario: New status entitlement entry
- **GIVEN** a reader consults the ubiquitous-language status entitlements table
- **WHEN** they look up the marker for a Fusion account created in the current operation run
- **THEN** a **New** entry SHALL define wire value `new` as the status on a Fusion account created in this aggregation rather than reconstructed from a previous Fusion account
- **AND** the entry SHALL state that reconstruction from a previous Fusion account removes `new`

---

## MODIFIED Requirements

_(none)_

---

## REMOVED Requirements

_(none)_
