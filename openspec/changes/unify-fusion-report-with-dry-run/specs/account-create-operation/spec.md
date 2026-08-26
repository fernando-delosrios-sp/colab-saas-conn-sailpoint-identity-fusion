# account-create-operation Delta

## MODIFIED Requirements

### Requirement: Account create executes action entitlements sequentially

When `input.attributes.actions` contains one or more action tokens, the account-create operation SHALL execute each action sequentially through the action handler dispatch in input order.

#### Scenario: Report action Add runs report pipeline

- **GIVEN** a Fusion account being created for a valid identity
- **WHEN** the report action entitlement is assigned during account create
- **THEN** the connector SHALL run the non-persistent Fusion report pipeline
- **AND** SHALL inhibit ISC write API calls for that nested pipeline
- **AND** SHALL apply the same Match outcome tree as account-list dry-run without persisting those outcomes
- **AND** SHALL deliver the Fusion report per report-service contract
- **AND** SHALL NOT stream the account-list output for that nested pipeline

#### Scenario: Report action Remove is a no-op on create

- **GIVEN** a Fusion account being created
- **WHEN** the report action entitlement is removed during account create
- **THEN** the connector SHALL take no report pipeline action

#### Scenario: Fusion action Add sets fusion action entitlement

- **GIVEN** a Fusion account being created for a valid identity
- **WHEN** the fusion action entitlement is assigned during account create
- **THEN** the returned Fusion account actions SHALL include the `fusion` action entitlement

#### Scenario: Fusion action Remove clears fusion action entitlement

- **GIVEN** a Fusion account being created with the fusion action entitlement assigned
- **WHEN** the fusion action entitlement is removed during account create
- **THEN** the returned Fusion account actions SHALL NOT include the `fusion` action entitlement

#### Scenario: Reviewer action Add assigns source reviewer

- **GIVEN** a Fusion account being created for a valid identity
- **AND** a managed source with id `src-a`
- **WHEN** the `reviewer:src-a` action entitlement is assigned during account create
- **THEN** the Fusion account SHALL record `src-a` as a source reviewer

#### Scenario: Reviewer action Remove clears source reviewer

- **GIVEN** a Fusion account with source reviewer `src-a` assigned
- **WHEN** the `reviewer:src-a` action entitlement is removed during account create
- **THEN** the Fusion account SHALL no longer record `src-a` as a source reviewer

#### Scenario: Invalid reviewer action fails with observable message

- **GIVEN** a Fusion account being created
- **WHEN** an action token does not start with `reviewer:`
- **THEN** the operation SHALL fail with a message matching `Invalid reviewer action value: <value>`

#### Scenario: Unsupported action fails with observable message

- **GIVEN** a Fusion account being created
- **WHEN** an unsupported action token is assigned during account create
- **THEN** the operation SHALL fail with message matching `Unsupported action: <actionName>`
