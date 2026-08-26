# account-create Spec

## Purpose

The account-create operation creates a managed account when provisioning is enabled. This spec defines the contract for account creation behavior.
## Requirements
### Requirement: Account create resolves identity and builds Fusion account

The account-create operation SHALL resolve the target identity name from create input and the configured Fusion display attribute, fetch the identity, pre-process all Fusion accounts for unique-attribute collision detection, process the identity into a Fusion account, set `Requested` status, refresh unique attributes, execute assigned action entitlements sequentially, and return the ISC Fusion account representation.

#### Scenario: Successful account create from identity

- **GIVEN** a valid connector configuration with Fusion display attribute configured
- **AND** an existing ISC identity matching the resolved identity name
- **WHEN** the account-create operation is invoked with valid create input
- **THEN** the connector SHALL fetch all Fusion accounts and pre-process them
- **AND** SHALL process the target identity into a Fusion account
- **AND** SHALL set the `Requested` status entitlement on the Fusion account
- **AND** SHALL refresh unique attributes on the Fusion account
- **AND** SHALL return an ISC account via `res.send`

#### Scenario: Identity not found fails with observable message

- **GIVEN** create input referencing an identity name that does not exist in ISC
- **WHEN** the account-create operation is invoked
- **THEN** the operation SHALL fail with a message matching `Identity not found: <identityName>`

#### Scenario: Missing schema fails with observable message

- **GIVEN** account-create input without a schema
- **WHEN** the account-create operation is invoked
- **THEN** the operation SHALL fail with message `Account schema is required`

#### Scenario: Invalid account data fails without creating account

- **GIVEN** account-create input that fails validation (for example missing identity name)
- **WHEN** the account-create operation is invoked
- **THEN** the operation SHALL fail with an observable error message
- **AND** SHALL NOT return a created ISC account

### Requirement: Account create nativeIdentity and name are immutable after creation

Once created, the Fusion account `nativeIdentity` and account name determined at creation time SHALL NOT be modified by subsequent account-read, account-update, account-enable, or account-disable operations.

#### Scenario: Create establishes immutable identifiers

- **GIVEN** a successful account-create operation for identity `Alice Doe`
- **WHEN** the returned ISC Fusion account is persisted
- **THEN** subsequent provisioning operations SHALL preserve the same `nativeIdentity` and Fusion account name established at creation

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

