# Delta for account-enable-operation

## REMOVED Requirements

### Requirement: Account enable pre-processes Fusion accounts and resets unique attributes
**Reason**: Unique attribute reset has been moved out of `accountEnable` into the `reset` action entitlement (`accountUpdate`).
**Migration**: Invoke `accountUpdate` adding `actions: ['reset']` when full unique attribute regeneration is needed.

## ADDED Requirements

### Requirement: Account enable rebuilds with REFRESH and preserves unique values

The account-enable operation SHALL rebuild the target Fusion account with attribute operations `REFRESH` (remap and redefine without unique reset), calculate blank Unique attributes, mark the Fusion account enabled, and return the ISC Fusion account representation. Populated Unique attribute values SHALL be preserved during enable. Calculating a blank Unique attribute SHALL NOT fetch or pre-process all Fusion accounts.

#### Scenario: Successful enable preserves unique values

- **GIVEN** a disabled Fusion account with established unique attribute values
- **WHEN** the account-enable operation is invoked
- **THEN** the connector SHALL rebuild with attribute operations `REFRESH`
- **AND** SHALL NOT reset unique attribute definitions during enable
- **AND** SHALL mark the Fusion account enabled
- **AND** SHALL return the ISC account via `res.send`

#### Scenario: Blank unique attribute is calculated without a tenant fetch

- **GIVEN** a disabled Fusion account with a blank Unique attribute
- **WHEN** the account-enable operation is invoked
- **THEN** the connector SHALL calculate the blank Unique attribute
- **AND** SHALL NOT fetch or pre-process all Fusion accounts
- **AND** SHALL NOT reset Unique attributes that already have a value

#### Scenario: Missing identity fails with observable message

- **GIVEN** account-enable input without an identity value
- **WHEN** the account-enable operation is invoked
- **THEN** the operation SHALL fail with message `Account identity is required`

#### Scenario: Fusion account not found fails with observable message

- **GIVEN** enable input referencing an identity with no Fusion account
- **WHEN** the account-enable operation is invoked
- **THEN** the operation SHALL fail with a message matching `Fusion account not found for identity: <identity>`
