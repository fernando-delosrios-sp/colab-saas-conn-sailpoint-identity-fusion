# Delta for account-update-operation

## ADDED Requirements

### Requirement: Account update supports reset action entitlement

When `input.changes` contains an `Add` change for the `reset` action entitlement, the connector SHALL initialize definition counters, fetch all Fusion accounts, register unique values from managed source accounts, pre-process all Fusion accounts, rebuild the target Fusion account with attribute operations `RESET`, refresh unique attributes, and return the updated ISC Fusion account representation. A `Remove` change for `reset` SHALL be a no-op.

#### Scenario: Reset action Add regenerates unique attributes

- **GIVEN** an existing Fusion account for a valid identity
- **WHEN** the `reset` action entitlement is added during account update
- **THEN** the connector SHALL pre-process all Fusion accounts before rebuilding the target account
- **AND** SHALL rebuild with attribute operations `RESET`
- **AND** SHALL refresh unique attributes on the target Fusion account
- **AND** SHALL preserve the Fusion account `nativeIdentity` and `fusionDisplayAttribute`
- **AND** SHALL return the updated ISC account via `res.send`

#### Scenario: Reset action Remove is a no-op on update

- **GIVEN** an existing Fusion account
- **WHEN** the `reset` action entitlement is removed during account update
- **THEN** the connector SHALL take no reset action
