# account-update-operation Delta

## MODIFIED Requirements

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
