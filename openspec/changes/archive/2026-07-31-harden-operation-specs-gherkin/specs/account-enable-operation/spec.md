## REMOVED Requirements

### Requirement: Account enable activates account

**Reason**: Replaced with preprocess, RESET, and enable contract.

**Migration**: Use ADDED requirements in this change.

## ADDED Requirements

### Requirement: Account enable pre-processes Fusion accounts and resets unique attributes

The account-enable operation SHALL initialize definition counters, fetch all Fusion accounts, register unique values from managed source accounts, pre-process all Fusion accounts, rebuild the target Fusion account with attribute operations RESET, refresh unique attributes, mark the Fusion account enabled, and return the ISC Fusion account representation.

#### Scenario: Successful enable regenerates unique attributes and enables account

- **GIVEN** a disabled Fusion account for the requested identity
- **WHEN** the account-enable operation is invoked
- **THEN** the connector SHALL pre-process all Fusion accounts before rebuilding the target account
- **AND** SHALL rebuild with attribute operations RESET
- **AND** SHALL refresh unique attributes on the target Fusion account
- **AND** SHALL mark the Fusion account enabled
- **AND** SHALL return the ISC account via `res.send`

#### Scenario: Missing identity fails with observable message

- **GIVEN** account-enable input without an identity value
- **WHEN** the account-enable operation is invoked
- **THEN** the operation SHALL fail with message `Account identity is required`

#### Scenario: Fusion account not found fails with observable message

- **GIVEN** enable input referencing an identity with no Fusion account
- **WHEN** the account-enable operation is invoked
- **THEN** the operation SHALL fail with a message matching `Fusion account not found for identity: <identity>`

### Requirement: Account enable preserves nativeIdentity and name

The account-enable operation SHALL NOT change the Fusion account `nativeIdentity` or account name established at creation.

#### Scenario: Enable preserves identifiers

- **GIVEN** a Fusion account created with a fixed `nativeIdentity` and name
- **WHEN** the account-enable operation completes successfully
- **THEN** the returned ISC account SHALL retain the same `nativeIdentity` and Fusion account name
