# account-update Spec

## Purpose

The account-update operation applies provisioning updates to an existing account. This spec defines the contract for account update behavior.
## Requirements
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

### Requirement: Account update rejects correlated entitlement Remove

When processing a Remove change for `correlate` or `correlated` action tokens on the account-update operation, the connector SHALL fail the operation. The correlated entitlement is derived from whether all managed source accounts are linked in the Fusion identity; it SHALL NOT be revocable via entitlement removal. Established correlation links SHALL remain unchanged because the operation fails before output is sent.

#### Scenario: Correlated Remove fails with observable message

- **GIVEN** an existing Fusion account with established correlations
- **WHEN** the account-update operation receives a Remove change for the `correlated` action entitlement
- **THEN** the operation SHALL fail with a message matching `Correlated entitlement cannot be removed: correlated`
- **AND** the connector SHALL NOT send an ISC account response
- **AND** established correlation links SHALL remain unchanged

#### Scenario: Correlate token Remove fails with observable message

- **GIVEN** an existing Fusion account
- **WHEN** the account-update operation receives a Remove change for the `correlate` action token
- **THEN** the operation SHALL fail with a message matching `Correlated entitlement cannot be removed: correlate`
- **AND** the connector SHALL NOT send an ISC account response

### Requirement: Account update executes action entitlements sequentially

When `input.changes` contains action entitlement Add or Remove operations, the account-update operation SHALL execute each change sequentially through the action handler dispatch. Reverse-correlation attribute preservation SHALL follow fusion-service requirements.

#### Scenario: Report action Add runs report pipeline

- **GIVEN** an existing Fusion account for a valid identity
- **WHEN** the report action entitlement is added during account update
- **THEN** the connector SHALL run the non-persistent Fusion report pipeline
- **AND** SHALL inhibit ISC write API calls for that nested pipeline
- **AND** SHALL apply the same Match outcome tree as account-list dry-run (auto-merge, Fusion review, deferred, non-match) without persisting those outcomes
- **AND** SHALL deliver the Fusion report per report-service contract
- **AND** SHALL NOT stream the account-list output for that nested pipeline

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


