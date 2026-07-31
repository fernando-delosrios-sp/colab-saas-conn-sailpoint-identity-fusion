## REMOVED Requirements

### Requirement: Account update modifies existing account

**Reason**: Replaced with precise update pipeline and action entitlement contract.

**Migration**: Use ADDED requirements in this change.

## ADDED Requirements

### Requirement: Account update rebuilds Fusion account with attribute operations NONE

The account-update operation SHALL rebuild the target Fusion account using attribute operations `NONE` (no attribute refresh or unique reset) before applying entitlement changes, then return the updated ISC Fusion account.

#### Scenario: Successful update returns rebuilt ISC account

- **GIVEN** an existing Fusion account for the requested identity
- **AND** at least one supported entitlement change in `input.changes`
- **WHEN** the account-update operation is invoked
- **THEN** the connector SHALL rebuild the Fusion account with attribute operations NONE
- **AND** SHALL return the updated ISC account via `res.send`

#### Scenario: Fusion account not found fails with observable message

- **GIVEN** update input referencing an identity with no Fusion account
- **WHEN** the account-update operation is invoked
- **THEN** the operation SHALL fail with a message matching `Fusion account not found for identity: <identity>`

#### Scenario: Empty changes fails with observable message

- **GIVEN** account-update input with an empty `changes` array
- **WHEN** the account-update operation is invoked
- **THEN** the operation SHALL fail with message `At least one change is required`

### Requirement: Account update accepts only actions entitlement changes

The account-update operation SHALL accept changes to the Fusion `actions` attribute only. Changes to any other attribute SHALL fail.

#### Scenario: Unsupported attribute change fails with observable message

- **GIVEN** an existing Fusion account
- **WHEN** the account-update operation receives a change for an attribute other than `actions`
- **THEN** the operation SHALL fail with message matching `Unsupported entitlement change: <attribute>`

### Requirement: Account update skips correlation status recompute on correlate Remove

When processing a Remove change for `correlate` or `correlated` action tokens, the account-update operation SHALL skip correlation-status recomputation on output generation. This reflects platform housekeeping; it does not undo established correlations.

#### Scenario: Correlate Remove skips correlation status recompute

- **GIVEN** an existing Fusion account with established correlations
- **WHEN** the account-update operation removes the `correlated` action entitlement
- **THEN** the connector SHALL generate ISC output with correlation-status recomputation suppressed
- **AND** established correlation links SHALL remain unchanged

### Requirement: Account update executes action entitlements sequentially

When `input.changes` contains action entitlement Add or Remove operations, the account-update operation SHALL execute each change sequentially through the action handler dispatch. Reverse-correlation attribute preservation SHALL follow fusion-service requirements.

#### Scenario: Report action Add runs report pipeline

- **GIVEN** an existing Fusion account for a valid identity
- **WHEN** the report action entitlement is added during account update
- **THEN** the connector SHALL run the non-persistent report pipeline
- **AND** SHALL deliver the aggregation-style report per report-service contract

#### Scenario: Report action Remove is a no-op on update

- **GIVEN** an existing Fusion account with the report action entitlement
- **WHEN** the report action entitlement is removed during account update
- **THEN** the connector SHALL take no report pipeline action

#### Scenario: Fusion action Add sets fusion action entitlement

- **GIVEN** an existing Fusion account for a valid identity
- **WHEN** the fusion action entitlement is added during account update
- **THEN** the returned Fusion account actions SHALL include the `fusion` action entitlement

#### Scenario: Fusion action Remove clears fusion action entitlement

- **GIVEN** an existing Fusion account with the fusion action entitlement
- **WHEN** the fusion action entitlement is removed during account update
- **THEN** the returned Fusion account actions SHALL NOT include the `fusion` action entitlement

#### Scenario: Reviewer action Add assigns source reviewer

- **GIVEN** an existing Fusion account for a valid identity
- **AND** a managed source with id `src-a`
- **WHEN** the `reviewer:src-a` action entitlement is added during account update
- **THEN** the Fusion account SHALL record `src-a` as a source reviewer

#### Scenario: Reviewer action Remove clears source reviewer

- **GIVEN** an existing Fusion account with source reviewer `src-a` assigned
- **WHEN** the `reviewer:src-a` action entitlement is removed during account update
- **THEN** the Fusion account SHALL no longer record `src-a` as a source reviewer

#### Scenario: Invalid reviewer action fails with observable message

- **GIVEN** an existing Fusion account
- **WHEN** an action change value does not start with `reviewer:`
- **THEN** the operation SHALL fail with a message matching `Invalid reviewer action value: <value>`

#### Scenario: Unsupported action fails with observable message

- **GIVEN** an existing Fusion account
- **WHEN** an unsupported action token is assigned during account update
- **THEN** the operation SHALL fail with message matching `Unsupported action: <actionName>`
